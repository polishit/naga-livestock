import { Router } from 'express';
import {
  ACTIVITY_STATUS_LABELS,
  BARANGAY_CENTERS,
  activitySchema,
  activityStatusSchema,
  announcementSchema,
  fmtDate,
  formatDistance,
  isoDate,
  signupStatusSchema,
  withdrawSchema,
  zoneCreateSchema,
  zoneLiftSchema,
  zoneUpdateSchema,
  type Barangay,
} from '@livestock/shared';
import { requireReviewer } from '../auth/auth';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse } from '../lib/http';
import { farmsInCircle, notifyOwners, notifyZone, ownersInBarangay } from '../services/ownerSide';

/* =====================================================================================
 * Monitoring zones: an epicenter with a radius around a confirmed case.
 * ===================================================================================== */

export const zonesRouter = Router();

async function zoneView(
  z: Awaited<ReturnType<typeof prisma.monitoringZone.findFirstOrThrow>>,
  withFarms = false,
) {
  const farms = await farmsInCircle(z.lat, z.lng, z.radiusM);
  const c = z.caseId
    ? await prisma.diseaseCase.findUnique({
        where: { id: z.caseId },
        select: { id: true, code: true, farmId: true },
      })
    : null;
  const inside = farms.filter((f) => f.id !== c?.farmId);
  const sent = await prisma.notification.count({ where: { refKey: { startsWith: `zone-${z.id}-farm-` } } });
  const read = await prisma.notification.count({
    where: { refKey: { startsWith: `zone-${z.id}-farm-` }, readAt: { not: null } },
  });
  let rows: unknown[] | undefined;
  if (withFarms) {
    const owners = await prisma.owner.findMany({
      where: { id: { in: inside.map((f) => f.ownerId) } },
      select: { id: true, fullName: true, contact: true, account: { select: { id: true } } },
    });
    const notes = await prisma.notification.findMany({
      where: { refKey: { in: inside.map((f) => `zone-${z.id}-farm-${f.id}`) } },
      select: { refKey: true, createdAt: true, readAt: true },
    });
    rows = inside.map((f) => {
      const o = owners.find((x) => x.id === f.ownerId);
      const n = notes.find((x) => x.refKey === `zone-${z.id}-farm-${f.id}`);
      return {
        farmId: f.id,
        code: f.code,
        name: f.name,
        barangay: f.barangay,
        distance: f.distance,
        owner: o?.fullName ?? '',
        contact: o?.contact ?? null,
        // No login: the owner must be told by phone or in person.
        hasApp: !!o?.account,
        notifiedAt: n?.createdAt ?? null,
        readAt: n?.readAt ?? null,
      };
    });
  }
  return {
    ...z,
    caseCode: c?.code ?? null,
    farms: inside.length,
    notified: sent,
    read,
    rows,
  };
}

zonesRouter.get(
  '/',
  ah(async (_req, res) => {
    const zones = await prisma.monitoringZone.findMany({ orderBy: [{ status: 'asc' }, { id: 'desc' }] });
    res.json(await Promise.all(zones.map((z) => zoneView(z))));
  }),
);

zonesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const z = await prisma.monitoringZone.findUnique({ where: { id: idParam(req) } });
    if (!z) throw notFound('Monitoring zone');
    res.json(await zoneView(z, true));
  }),
);

/** Set an epicenter for a confirmed case. Owners of the farms inside are notified at once. */
zonesRouter.post(
  '/',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(zoneCreateSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id: d.caseId } });
    if (!c || c.voidedAt) throw notFound('Disease case');
    if (c.status !== 'POSITIVE')
      throw badRequest('A monitoring zone is set only for a confirmed (positive) case.');
    if (c.closedAt) throw badRequest('This case is closed.');
    if (c.lat == null || c.lng == null)
      throw badRequest('This case has no map location yet. Pin its farm on the map first.');
    const existing = await prisma.monitoringZone.findFirst({ where: { caseId: c.id, status: 'ACTIVE' } });
    if (existing)
      throw badRequest(
        `${c.code} already has an active monitoring zone (${existing.code}). Change its radius instead.`,
      );
    const by = req.user!.name;
    const zone = await prisma.$transaction(async (tx) => {
      const created = await tx.monitoringZone.create({
        data: {
          code: tempCode(),
          caseId: c.id,
          disease: c.disease,
          barangay: c.barangay,
          lat: c.lat!,
          lng: c.lng!,
          radiusM: d.radiusM,
          guidance: d.guidance ?? null,
          createdBy: by,
        },
      });
      const z = await tx.monitoringZone.update({
        where: { id: created.id },
        data: { code: displayCode('ZONE', created.id) },
      });
      await logActivity(
        'case',
        c.id,
        'zone',
        `Monitoring zone ${z.code} set around ${c.code}: ${formatDistance(z.radiusM)}`,
        by,
        tx,
      );
      return z;
    });
    const sent = await notifyZone(zone);
    res.status(201).json({ ...zone, ...sent });
  }),
);

/** Change the radius or the guidance. Farms newly inside a wider radius are notified. */
zonesRouter.patch(
  '/:id',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(zoneUpdateSchema, req.body);
    const before = await prisma.monitoringZone.findUnique({ where: { id: idParam(req) } });
    if (!before) throw notFound('Monitoring zone');
    if (before.status !== 'ACTIVE') throw badRequest('This zone was lifted and can no longer be changed.');
    const z = await prisma.monitoringZone.update({
      where: { id: before.id },
      data: { radiusM: d.radiusM, guidance: d.guidance ?? null },
    });
    if (before.radiusM !== z.radiusM && z.caseId)
      await logActivity(
        'case',
        z.caseId,
        'zone',
        `Monitoring zone ${z.code} radius changed: ${formatDistance(before.radiusM)} → ${formatDistance(z.radiusM)}`,
        req.user!.name,
      );
    // Already-notified farms are skipped (one alert per farm per zone).
    const sent = z.radiusM > before.radiusM ? await notifyZone(z) : { farms: 0, sent: 0 };
    res.json({ ...z, newlyNotified: sent.sent });
  }),
);

zonesRouter.post(
  '/:id/lift',
  requireReviewer,
  ah(async (req, res) => {
    const { reason } = parse(zoneLiftSchema, req.body);
    const before = await prisma.monitoringZone.findUnique({ where: { id: idParam(req) } });
    if (!before) throw notFound('Monitoring zone');
    if (before.status !== 'ACTIVE') throw badRequest('This zone is already lifted.');
    const by = req.user!.name;
    const z = await prisma.monitoringZone.update({
      where: { id: before.id },
      data: { status: 'LIFTED', liftedBy: by, liftedAt: new Date(), liftReason: reason },
    });
    if (z.caseId)
      await logActivity('case', z.caseId, 'zone', `Monitoring zone ${z.code} lifted: ${reason}`, by);
    const farms = await farmsInCircle(z.lat, z.lng, z.radiusM);
    const sent = await notifyOwners(
      farms.map((f) => f.ownerId),
      {
        type: 'ALERT',
        title: `${z.disease} monitoring area lifted`,
        body: `The monitoring area for ${z.disease} around your farm was lifted by the City Veterinary Office. Keep watching your animals and report any that get sick.`,
        link: '/app/alerts',
        refKey: `zone-${z.id}-lifted`,
      },
    );
    res.json({ ...z, notified: sent });
  }),
);

/* =====================================================================================
 * Vaccination activities scheduled per barangay.
 * ===================================================================================== */

export const activitiesRouter = Router();

const when = (a: { date: Date; time: string | null; venue: string | null }) =>
  `${fmtDate(a.date)}${a.time ? `, ${a.time}` : ''}${a.venue ? ` at ${a.venue}` : ''}`;
const audienceOf = (a: { barangay: string; species: string }) =>
  ownersInBarangay(a.barangay === 'ALL' ? null : a.barangay, a.species === 'All' ? null : a.species);

activitiesRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.vaccinationActivity.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      include: { signups: { where: { status: { not: 'CANCELLED' } } } },
    });
    res.json(
      rows.map((a) => ({
        ...a,
        date: ymd(a.date),
        statusLabel: ACTIVITY_STATUS_LABELS[a.status as keyof typeof ACTIVITY_STATUS_LABELS] ?? a.status,
        signedUp: a.signups.length,
        heads: a.signups.reduce((x, s) => x + s.heads, 0),
        attended: a.signups.filter((s) => s.status === 'ATTENDED').length,
        signups: undefined,
      })),
    );
  }),
);

/** Who will be told about an activity (for the review step before it is scheduled). */
activitiesRouter.get(
  '/audience',
  ah(async (req, res) => {
    const barangay = typeof req.query.barangay === 'string' ? req.query.barangay : 'ALL';
    const species = typeof req.query.species === 'string' ? req.query.species : 'All';
    const ids = await audienceOf({ barangay, species });
    const withApp = ids.length
      ? await prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE', ownerId: { in: ids } } })
      : 0;
    res.json({ owners: ids.length, withApp });
  }),
);

activitiesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const a = await prisma.vaccinationActivity.findUnique({
      where: { id: idParam(req) },
      include: { signups: { orderBy: { id: 'asc' } } },
    });
    if (!a) throw notFound('Activity');
    const [farms, owners] = await Promise.all([
      prisma.farm.findMany({
        where: { id: { in: a.signups.map((s) => s.farmId) } },
        select: { id: true, code: true, name: true, barangay: true },
      }),
      prisma.owner.findMany({
        where: { id: { in: a.signups.map((s) => s.ownerId) } },
        select: { id: true, fullName: true, contact: true },
      }),
    ]);
    res.json({
      ...a,
      date: ymd(a.date),
      signups: a.signups.map((s) => ({
        ...s,
        farm: farms.find((f) => f.id === s.farmId),
        owner: owners.find((o) => o.id === s.ownerId),
      })),
    });
  }),
);

activitiesRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(activitySchema, req.body);
    if (d.date < isoDate())
      throw badRequest('Validation failed', { fieldErrors: { date: ['Choose today or a later date'] } });
    const by = req.user!.name;
    const a = await prisma.$transaction(async (tx) => {
      const c = await tx.vaccinationActivity.create({
        data: {
          code: tempCode(),
          title: d.title,
          vaccine: d.vaccine ?? null,
          species: d.species,
          barangay: d.barangay,
          date: dateOnly(d.date)!,
          time: d.time ?? null,
          venue: d.venue ?? null,
          notes: d.notes ?? null,
          createdBy: by,
        },
      });
      return tx.vaccinationActivity.update({ where: { id: c.id }, data: { code: displayCode('ACT', c.id) } });
    });
    await logActivity(
      'activity',
      a.id,
      'scheduled',
      `${a.code}: ${a.title} scheduled for ${when(a)} (${a.barangay === 'ALL' ? 'all barangays' : a.barangay})`,
      by,
    );
    const notified = await notifyOwners(await audienceOf(a), {
      type: 'VACCINATION',
      title: `${a.title}: ${fmtDate(a.date)}`,
      body: `The City Veterinary Office scheduled ${a.title}${a.vaccine ? ` (${a.vaccine})` : ''} for ${a.species === 'All' ? 'livestock' : a.species} on ${when(a)}. Open Vaccination to sign up your animals.${a.notes ? `\n\n${a.notes}` : ''}`,
      link: '/app/vaccination',
      refKey: `act-${a.id}`,
    });
    res.status(201).json({ ...a, notified });
  }),
);

/** Change the details. A new date, time or venue is sent to the owners already told. */
activitiesRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const d = parse(activitySchema, req.body);
    const before = await prisma.vaccinationActivity.findUnique({ where: { id: idParam(req) } });
    if (!before) throw notFound('Activity');
    if (['COMPLETED', 'CANCELLED'].includes(before.status))
      throw badRequest('This activity is finished and can no longer be changed.');
    const a = await prisma.vaccinationActivity.update({
      where: { id: before.id },
      data: {
        title: d.title,
        vaccine: d.vaccine ?? null,
        species: d.species,
        barangay: d.barangay,
        date: dateOnly(d.date)!,
        time: d.time ?? null,
        venue: d.venue ?? null,
        notes: d.notes ?? null,
      },
    });
    let notified = 0;
    if (when(before) !== when(a)) {
      await logActivity(
        'activity',
        a.id,
        'rescheduled',
        `${a.code} moved: ${when(before)} → ${when(a)}`,
        req.user!.name,
      );
      notified = await notifyOwners(await audienceOf(a), {
        type: 'VACCINATION',
        title: `Changed: ${a.title}`,
        body: `${a.title} was moved. New schedule: ${when(a)} (it was ${when(before)}).`,
        link: '/app/vaccination',
      });
    }
    res.json({ ...a, notified });
  }),
);

/** Scheduled → Ongoing → Completed, or Cancelled with a reason (owners are told). */
activitiesRouter.post(
  '/:id/status',
  ah(async (req, res) => {
    const d = parse(activityStatusSchema, req.body);
    const before = await prisma.vaccinationActivity.findUnique({ where: { id: idParam(req) } });
    if (!before) throw notFound('Activity');
    const allowed: Record<string, string[]> = {
      SCHEDULED: ['ONGOING', 'COMPLETED', 'CANCELLED'],
      ONGOING: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!allowed[before.status]?.includes(d.status))
      throw badRequest(
        `An activity that is ${ACTIVITY_STATUS_LABELS[before.status as keyof typeof ACTIVITY_STATUS_LABELS]} cannot be set to ${ACTIVITY_STATUS_LABELS[d.status]}.`,
      );
    const a = await prisma.vaccinationActivity.update({
      where: { id: before.id },
      data: { status: d.status, cancelReason: d.status === 'CANCELLED' ? d.reason! : null },
    });
    await logActivity(
      'activity',
      a.id,
      d.status.toLowerCase(),
      `${a.code} ${ACTIVITY_STATUS_LABELS[d.status]}${d.reason ? `: ${d.reason}` : ''}`,
      req.user!.name,
    );
    if (d.status === 'CANCELLED')
      await notifyOwners(await audienceOf(a), {
        type: 'VACCINATION',
        title: `Cancelled: ${a.title}`,
        body: `${a.title} on ${when(a)} was cancelled: ${d.reason}`,
        link: '/app/vaccination',
        refKey: `act-${a.id}-cancelled`,
      });
    // Those who signed up but were not marked as attended are recorded as "did not attend".
    if (d.status === 'COMPLETED')
      await prisma.activitySignup.updateMany({
        where: { activityId: a.id, status: 'SIGNED_UP' },
        data: { status: 'NO_SHOW' },
      });
    res.json(a);
  }),
);

/** Mark a sign-up attended: the vaccination goes on the farm's official record. */
activitiesRouter.post(
  '/signups/:id/status',
  ah(async (req, res) => {
    const d = parse(signupStatusSchema, req.body);
    const s = await prisma.activitySignup.findUnique({
      where: { id: idParam(req) },
      include: { activity: true },
    });
    if (!s) throw notFound('Sign-up');
    if (s.status === 'ATTENDED')
      throw badRequest('Already marked as attended. Void the vaccination record to undo it.');
    if (s.activity.status === 'CANCELLED') throw badRequest('This activity was cancelled.');
    const by = req.user!.name;
    if (d.status !== 'ATTENDED') {
      await prisma.activitySignup.update({ where: { id: s.id }, data: { status: d.status } });
      return res.json({ ok: true });
    }
    if (ymd(s.activity.date)! > isoDate())
      throw badRequest('Attendance can be marked on or after the activity date.');
    const group = await prisma.populationGroup.findFirst({
      where: { farmId: s.farmId, species: s.species, archived: false },
      orderBy: { count: 'desc' },
    });
    if (!group || group.count < 1) throw badRequest(`The farm has no ${s.species} on record.`);
    await prisma.$transaction(async (tx) => {
      const c = await tx.vaccination.create({
        data: {
          code: tempCode(),
          farmId: s.farmId,
          target: 'GROUP',
          groupId: group.id,
          species: s.species,
          count: Math.min(s.heads, group.count),
          serviceType: 'VACCINATION',
          vaccine: s.activity.vaccine,
          date: s.activity.date,
          administeredBy: by,
          remarks: `${s.activity.code}: ${s.activity.title}`,
        },
      });
      const v = await tx.vaccination.update({
        where: { id: c.id },
        data: { code: displayCode('VAC', c.id) },
      });
      await tx.activitySignup.update({
        where: { id: s.id },
        data: { status: 'ATTENDED', vaccinationId: v.id },
      });
      await logActivity(
        'farm',
        s.farmId,
        'vaccination',
        `${v.code}: ${s.activity.vaccine ?? 'vaccination'} for ${v.count} ${s.species} at ${s.activity.code}`,
        by,
        tx,
      );
    });
    res.json({ ok: true });
  }),
);

/* =====================================================================================
 * Announcements and advisories.
 * ===================================================================================== */

export const announcementsRouter = Router();

announcementsRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.announcement.findMany({ orderBy: { id: 'desc' } });
    const read = await prisma.notification.groupBy({
      by: ['refKey'],
      where: { refKey: { in: rows.map((a) => `ann-${a.id}`) }, readAt: { not: null } },
      _count: true,
    });
    res.json(rows.map((a) => ({ ...a, read: read.find((r) => r.refKey === `ann-${a.id}`)?._count ?? 0 })));
  }),
);

announcementsRouter.post(
  '/',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(announcementSchema, req.body);
    let owners: number[];
    if (d.audience === 'ZONE') {
      const z = await prisma.monitoringZone.findUnique({ where: { id: d.zoneId! } });
      if (!z || z.status !== 'ACTIVE')
        throw badRequest('Validation failed', {
          fieldErrors: { zoneId: ['Select an active monitoring zone'] },
        });
      owners = (await farmsInCircle(z.lat, z.lng, z.radiusM)).map((f) => f.ownerId);
    } else owners = await ownersInBarangay(d.audience === 'BARANGAY' ? d.barangay! : null);
    const by = req.user!.name;
    const a = await prisma.$transaction(async (tx) => {
      const c = await tx.announcement.create({
        data: {
          code: tempCode(),
          title: d.title,
          body: d.body,
          audience: d.audience,
          barangay: d.audience === 'BARANGAY' ? d.barangay! : null,
          zoneId: d.audience === 'ZONE' ? d.zoneId! : null,
          publishedBy: by,
        },
      });
      return tx.announcement.update({ where: { id: c.id }, data: { code: displayCode('ANN', c.id) } });
    });
    const recipients = await notifyOwners(owners, {
      type: 'ANNOUNCEMENT',
      title: a.title,
      body: a.body,
      link: '/app/alerts?tab=announcements',
      refKey: `ann-${a.id}`,
    });
    const out = await prisma.announcement.update({ where: { id: a.id }, data: { recipients } });
    await logActivity(
      'announcement',
      a.id,
      'published',
      `${a.code} published: ${a.title} (${recipients} owner(s) notified)`,
      by,
    );
    res.status(201).json(out);
  }),
);

/** A wrong announcement is withdrawn (kept on record, hidden from owners). Publish a new one to correct it. */
announcementsRouter.post(
  '/:id/withdraw',
  requireReviewer,
  ah(async (req, res) => {
    const { reason } = parse(withdrawSchema, req.body);
    const before = await prisma.announcement.findUnique({ where: { id: idParam(req) } });
    if (!before) throw notFound('Announcement');
    if (before.status !== 'PUBLISHED') throw badRequest('This announcement is already withdrawn.');
    const by = req.user!.name;
    const a = await prisma.announcement.update({
      where: { id: before.id },
      data: { status: 'WITHDRAWN', withdrawnBy: by, withdrawnAt: new Date(), withdrawReason: reason },
    });
    await logActivity('announcement', a.id, 'withdrawn', `${a.code} withdrawn: ${reason}`, by);
    res.json(a);
  }),
);

/* =====================================================================================
 * Public information: no sign-in, no personal data, no exact locations.
 * ===================================================================================== */

export const publicRouter = Router();

publicRouter.get(
  '/overview',
  ah(async (_req, res) => {
    const year = isoDate().slice(0, 4);
    const [groups, farms, cases, zones, vacc, activities] = await Promise.all([
      prisma.populationGroup.findMany({
        where: { archived: false, count: { gt: 0 }, farm: { archived: false } },
        select: { species: true, count: true, farm: { select: { barangay: true } } },
      }),
      prisma.farm.groupBy({ by: ['barangay'], where: { archived: false }, _count: true }),
      // Confirmed cases that are still open, by barangay only.
      prisma.diseaseCase.findMany({
        where: { status: 'POSITIVE', closedAt: null, voidedAt: null },
        select: {
          id: true,
          code: true,
          barangay: true,
          disease: true,
          species: true,
          lat: true,
          lng: true,
          reportedAt: true,
        },
      }),
      prisma.monitoringZone.findMany({
        where: { status: 'ACTIVE' },
        select: {
          code: true,
          caseId: true,
          barangay: true,
          disease: true,
          radiusM: true,
          lat: true,
          lng: true,
          guidance: true,
          createdAt: true,
        },
      }),
      prisma.vaccination.aggregate({
        where: { serviceType: 'VACCINATION', voidedAt: null, date: { gte: dateOnly(`${year}-01-01`) } },
        _sum: { count: true },
        _count: true,
      }),
      prisma.vaccinationActivity.findMany({
        where: { status: { in: ['SCHEDULED', 'ONGOING'] }, date: { gte: dateOnly(isoDate()) } },
        orderBy: { date: 'asc' },
        take: 10,
        select: { title: true, barangay: true, species: true, date: true, time: true, venue: true },
      }),
    ]);
    const bySpecies = new Map<string, number>();
    const byBarangay = new Map<string, number>();
    for (const g of groups) {
      bySpecies.set(g.species, (bySpecies.get(g.species) ?? 0) + g.count);
      byBarangay.set(g.farm.barangay, (byBarangay.get(g.farm.barangay) ?? 0) + g.count);
    }
    const names = [...new Set([...farms.map((f) => f.barangay), ...cases.map((c) => c.barangay)])].sort();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      updatedAt: new Date(),
      totals: {
        livestock: groups.reduce((a, g) => a + g.count, 0),
        farms: farms.reduce((a, f) => a + f._count, 0),
        confirmedOpen: cases.length,
        activeZones: zones.length,
        vaccinatedThisYear: vacc._sum.count ?? 0,
      },
      species: [...bySpecies.entries()]
        .map(([species, count]) => ({ species, count }))
        .sort((a, b) => b.count - a.count),
      // One point per barangay (its centre), never a farm's location.
      barangays: names.map((b) => ({
        barangay: b,
        center: BARANGAY_CENTERS[b as Barangay] ?? null,
        farms: farms.find((f) => f.barangay === b)?._count ?? 0,
        livestock: byBarangay.get(b) ?? 0,
        confirmedOpen: cases.filter((c) => c.barangay === b).length,
        diseases: [...new Set(cases.filter((c) => c.barangay === b).map((c) => c.disease))],
        monitoring: zones.some((z) => z.barangay === b),
      })),
      activities: activities.map((a) => ({ ...a, date: ymd(a.date) })),
      // Where confirmed cases are, so residents know which area to avoid. The owner and the farm
      // are never named: only the disease, the barangay and the point.
      cases: cases
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({
          code: c.code,
          disease: c.disease,
          species: c.species,
          barangay: c.barangay,
          lat: c.lat,
          lng: c.lng,
          reportedAt: ymd(c.reportedAt),
        })),
      zones: zones.map((z) => ({
        code: z.code,
        disease: z.disease,
        barangay: z.barangay,
        lat: z.lat,
        lng: z.lng,
        radiusM: z.radiusM,
        guidance: z.guidance,
        since: ymd(z.createdAt),
      })),
    });
  }),
);
