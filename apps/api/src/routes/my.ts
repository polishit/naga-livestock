import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  CASE_STAGE_LABELS,
  POP_REASON_LABELS,
  SERVICE_TYPE_LABELS,
  diseaseReportSchema,
  distanceMeters,
  farmRegistrationSchema,
  fmtDate,
  insideNaga,
  nearestBarangay,
  isoDate,
  notifPrefsSchema,
  ownerMessageSchema,
  ownerProfileSchema,
  ownerVerificationSchema,
  ownerVaccinationSchema,
  populationRequestSchema,
  reportReplySchema,
  roundDistance,
  serviceRequestSchema,
  signupSchema,
  type CaseStage,
  type PopReason,
} from '@livestock/shared';
import { audit, prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, ymd } from '../lib/dates';
import { HttpError, ah, badRequest, idParam, notFound, parse } from '../lib/http';
import {
  applyPopulationRequest,
  flagReason,
  notifyOwner,
  requestedDelta,
  stageOfCase,
} from '../services/ownerSide';
import { THREAD_TYPES, ownerThread } from '../services/messages';
import { getSettings } from '../services/settings';
import { filesRouter, reverseGeocode, uploadsRouter } from './misc';

/**
 * The owner app API. Every route works only for a signed-in livestock owner and only ever reads or
 * changes that owner's own records: each query is filtered by the owner id taken from the login,
 * never from the request.
 */
export const myRouter = Router();

export function ownerOnly(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Not authenticated'));
  if (req.user.role !== 'OWNER' || !req.user.ownerId)
    return next(new HttpError(403, 'This is for livestock owners'));
  next();
}
myRouter.use(ownerOnly);

/**
 * What an owner may do depends on the review of their registration:
 *  - Verified (ACTIVE): everything.
 *  - Pending or returned: complete the profile, send the ID, register farms, read advisories and
 *    alerts. Head counts, reports, sign-ups and requests need a verified owner and farm.
 *  - Not accepted (INACTIVE) or archived: only the home screen (the reason and the office contact)
 *    and their notifications.
 */
const PENDING_OK: [string, RegExp][] = [
  ['GET', /^\//],
  ['PATCH', /^\/profile$/],
  ['POST', /^\/verification$/],
  ['POST', /^\/farms$/],
  ['PATCH', /^\/registrations\/\d+$/],
  ['POST', /^\/uploads\/?$/],
  ['POST', /^\/notifications\/read$/],
  ['POST', /^\/messages$/],
  ['PUT', /^\/settings$/],
];
const CLOSED_OK: [string, RegExp][] = [
  ['GET', /^\/(home|notifications|files\/.*)$/],
  ['POST', /^\/notifications\/read$/],
];
myRouter.use(
  ah(async (req, _res, next) => {
    const o = await prisma.owner.findUnique({ where: { id: req.user!.ownerId! }, select: { status: true } });
    const status = o?.status ?? 'INACTIVE';
    if (status === 'ACTIVE') return next();
    const allowed = status === 'PENDING' ? PENDING_OK : CLOSED_OK;
    if (allowed.some(([m, re]) => m === req.method && re.test(req.path))) return next();
    throw new HttpError(
      403,
      status === 'PENDING'
        ? 'Your registration is still being verified by the City Veterinary Office. You can do this once you are verified.'
        : 'Your registration is not active. Contact the City Veterinary Office.',
    );
  }),
);

myRouter.use('/uploads', uploadsRouter);
// An ID photo is shown only to the owner it belongs to (and to staff, through /api/files).
myRouter.use(
  '/files',
  ah(async (req, _res, next) => {
    if (!req.path.startsWith('/ids/')) return next();
    const o = await prisma.owner.findUnique({
      where: { id: req.user!.ownerId! },
      select: { idPhotoKeys: true },
    });
    const mine = ((o?.idPhotoKeys as string[] | null) ?? []).includes(req.path.slice(1));
    if (!mine) throw new HttpError(404, 'File not found');
    next();
  }),
  filesRouter,
);

const me = (req: Request) => req.user!.ownerId!;
const fileUrls = (keys: unknown) =>
  ((keys as string[] | null) ?? []).map((k) => ({ key: k, url: `/api/my/files/${k}` }));

/** One of the owner's own farms (404 for anyone else's, so nothing is revealed). */
async function myFarm(req: Request, farmId: number) {
  const farm = await prisma.farm.findFirst({ where: { id: farmId, ownerId: me(req) } });
  if (!farm) throw notFound('Farm');
  return farm;
}

/** Monitoring zones that are active and contain one of the owner's farms. */
async function myAlerts(ownerId: number) {
  const [zones, farms] = await Promise.all([
    prisma.monitoringZone.findMany({ where: { status: 'ACTIVE' }, orderBy: { id: 'desc' } }),
    prisma.farm.findMany({
      where: { ownerId, archived: false, lat: { not: null }, lng: { not: null } },
      select: { id: true, name: true, lat: true, lng: true },
    }),
  ]);
  // Ground zero is not "near" itself: its owner follows the case instead.
  const epicenters = new Map(
    (
      await prisma.diseaseCase.findMany({
        where: { id: { in: zones.map((z) => z.caseId).filter((x): x is number => !!x) } },
        select: { id: true, farmId: true },
      })
    ).map((c) => [c.id, c.farmId]),
  );
  const out = [];
  for (const z of zones)
    for (const f of farms) {
      if (z.caseId && epicenters.get(z.caseId) === f.id) continue;
      const d = roundDistance(distanceMeters(z.lat, z.lng, f.lat!, f.lng!));
      if (d <= z.radiusM)
        out.push({
          zoneId: z.id,
          code: z.code,
          disease: z.disease,
          // The barangay only: the reporting farm is never named.
          barangay: z.barangay,
          radiusM: z.radiusM,
          guidance: z.guidance,
          since: z.createdAt,
          farmId: f.id,
          farmName: f.name,
          distance: d,
        });
    }
  return out;
}

/** The day before a vaccination activity the owner signed up for, remind them (once). */
async function sendReminders(ownerId: number) {
  const tomorrow = isoDate(new Date(Date.now() + 86_400_000));
  const signups = await prisma.activitySignup.findMany({
    where: {
      ownerId,
      status: 'SIGNED_UP',
      activity: { status: 'SCHEDULED', date: dateOnly(tomorrow) },
    },
    include: { activity: true },
  });
  for (const s of signups)
    await notifyOwner(ownerId, {
      type: 'VACCINATION',
      title: `Reminder: ${s.activity.title} is tomorrow`,
      body: `${s.activity.title} is tomorrow, ${fmtDate(s.activity.date)}${s.activity.time ? `, ${s.activity.time}` : ''}${s.activity.venue ? ` at ${s.activity.venue}` : ''}. You signed up ${s.heads} ${s.species}.`,
      link: '/app/vaccination',
      refKey: `remind-${s.id}-${tomorrow}`,
    });
}

/** New in Messages: office replies and answers to the owner's transactions not read yet. */
async function unreadCount(userId: number, ownerId: number) {
  const [notes, msgs] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null, type: { in: THREAD_TYPES } } }),
    prisma.ownerMessage.count({ where: { ownerId, fromOwner: false, readAt: null } }),
  ]);
  return notes + msgs;
}

/* ---------------- home ---------------- */

myRouter.get(
  '/home',
  ah(async (req, res) => {
    const ownerId = me(req);
    await sendReminders(ownerId).catch(() => undefined);
    const settings = await getSettings();
    const [owner, farms, registrations, unread, alerts, reports, pendingPop] = await Promise.all([
      prisma.owner.findUnique({ where: { id: ownerId } }),
      prisma.farm.findMany({
        where: { ownerId },
        orderBy: { id: 'asc' },
        include: { groups: { where: { archived: false }, orderBy: { id: 'asc' } } },
      }),
      prisma.farmRegistration.findMany({
        where: { ownerId, status: { not: 'APPROVED' } },
        orderBy: { id: 'desc' },
      }),
      unreadCount(req.user!.id, ownerId),
      myAlerts(ownerId),
      prisma.diseaseReport.count({ where: { ownerId, status: { in: ['REPORTED', 'INFO_REQUESTED'] } } }),
      prisma.populationRequest.count({ where: { ownerId, status: 'PENDING' } }),
    ]);
    if (!owner) throw notFound('Owner');
    res.json({
      owner: {
        id: owner.id,
        code: owner.code,
        fullName: owner.fullName,
        barangay: owner.barangay,
        zone: owner.zone,
        street: owner.street,
        contact: owner.contact,
        email: owner.email,
        rsbsa: owner.rsbsa,
        // PENDING → waiting for the CVO; ACTIVE → verified
        status: owner.status,
        returnReason: owner.returnReason,
        registeredAt: owner.registeredAt,
        submittedAt: owner.submittedAt,
        reviewedAt: owner.reviewedAt,
        idType: owner.idType,
        idNumber: owner.idNumber,
        idPhotos: fileUrls(owner.idPhotoKeys),
      },
      office: { name: settings.officeName, address: settings.officeAddress, contact: settings.officeContact },
      farms: farms.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        type: f.type,
        barangay: f.barangay,
        address: f.address,
        lat: f.lat,
        lng: f.lng,
        status: f.archived ? 'INACTIVE' : 'VERIFIED',
        livestock: f.groups.filter((g) => g.count > 0).map((g) => ({ species: g.species, count: g.count })),
        total: f.groups.reduce((a, g) => a + g.count, 0),
      })),
      registrations,
      unread,
      alerts,
      openReports: reports,
      pendingPopulation: pendingPop,
    });
  }),
);

myRouter.patch(
  '/profile',
  ah(async (req, res) => {
    const d = parse(ownerProfileSchema, req.body);
    const before = await prisma.owner.findUnique({ where: { id: me(req) } });
    if (!before) throw notFound('Owner');
    const o = await prisma.owner.update({
      where: { id: before.id },
      data: {
        fullName: d.fullName,
        barangay: d.barangay,
        zone: d.zone ?? null,
        street: d.street ?? null,
        rsbsa: d.rsbsa ?? null,
        email: d.email ?? null,
      },
    });
    if (d.fullName !== req.user!.name)
      await prisma.user.update({ where: { id: req.user!.id }, data: { name: d.fullName } });
    await logActivity(
      'owner',
      o.id,
      'updated',
      `${o.fullName} updated their own details (owner app)`,
      o.fullName,
    );
    res.json({ ok: true });
  }),
);

/**
 * Send the ID for verification, or correct a returned registration and send it back for review.
 * The profile is saved separately; this puts the owner back in the reviewer's queue.
 */
myRouter.post(
  '/verification',
  ah(async (req, res) => {
    const d = parse(ownerVerificationSchema, req.body);
    const o = await prisma.owner.findUnique({ where: { id: me(req) } });
    if (!o) throw notFound('Owner');
    if (o.status !== 'PENDING') throw badRequest('Your registration was already decided.');
    const keys = d.idPhotoKeys;
    if (keys.some((k) => !k.startsWith('ids/')))
      throw badRequest('Validation failed', { fieldErrors: { idPhotoKeys: ['Upload the ID photo again'] } });
    const resent = !!o.returnReason;
    await prisma.owner.update({
      where: { id: o.id },
      data: {
        idType: d.idType,
        idNumber: d.idNumber,
        idPhotoKeys: keys,
        returnReason: null,
        submittedAt: new Date(),
      },
    });
    await logActivity(
      'owner',
      o.id,
      resent ? 'resubmitted' : 'id-sent',
      resent
        ? `${o.fullName} corrected the registration and sent it for review again`
        : `${o.fullName} sent their ID for verification`,
      o.fullName,
    );
    res.json({ ok: true });
  }),
);

/** Map of disease activity for the owner: active zones, confirmed cases (unnamed) and their farms. */
myRouter.get(
  '/map',
  ah(async (req, res) => {
    const [zones, cases, farms] = await Promise.all([
      prisma.monitoringZone.findMany({ where: { status: 'ACTIVE' }, orderBy: { id: 'desc' } }),
      prisma.diseaseCase.findMany({
        where: { status: 'POSITIVE', closedAt: null, voidedAt: null, lat: { not: null }, lng: { not: null } },
        select: {
          id: true,
          code: true,
          disease: true,
          species: true,
          barangay: true,
          lat: true,
          lng: true,
          reportedAt: true,
          ownerId: true,
        },
      }),
      prisma.farm.findMany({
        where: { ownerId: me(req), archived: false, lat: { not: null }, lng: { not: null } },
        select: { id: true, name: true, lat: true, lng: true },
      }),
    ]);
    const mine = new Set((await myAlerts(me(req))).map((a) => a.zoneId));
    res.json({
      zones: zones.map((z) => ({
        id: z.id,
        code: z.code,
        disease: z.disease,
        barangay: z.barangay,
        lat: z.lat,
        lng: z.lng,
        radiusM: z.radiusM,
        guidance: z.guidance,
        since: z.createdAt,
        affectsMe: mine.has(z.id),
      })),
      cases: cases.map((c) => ({
        code: c.code,
        disease: c.disease,
        species: c.species,
        barangay: c.barangay,
        lat: c.lat,
        lng: c.lng,
        reportedAt: ymd(c.reportedAt),
        mine: c.ownerId === me(req),
      })),
      farms,
    });
  }),
);

/** The address of a GPS point (farm form). When the map service is down, the nearest barangay only. */
myRouter.get(
  '/geocode/reverse',
  ah(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      throw badRequest('Invalid coordinates');
    try {
      res.json(await reverseGeocode(lat, lng));
    } catch {
      res.json({ address: '', barangay: nearestBarangay(lat, lng) });
    }
  }),
);

/* ---------------- farm registration ---------------- */

const checkPin = (lat: number, lng: number) => {
  if (!insideNaga(lat, lng))
    throw badRequest('Validation failed', {
      fieldErrors: {
        lat: [
          'This location is outside Naga City. Move the pin to where the farm is, or ask the office for help.',
        ],
      },
    });
};

myRouter.post(
  '/farms',
  ah(async (req, res) => {
    const d = parse(farmRegistrationSchema, req.body);
    checkPin(d.lat, d.lng);
    const owner = await prisma.owner.findUnique({ where: { id: me(req) } });
    if (!owner || !['ACTIVE', 'PENDING'].includes(owner.status))
      throw badRequest('Your registration is not active. Contact the City Veterinary Office.');
    // The same farm sent twice (same name, still waiting) is refused.
    const again = await prisma.farmRegistration.findFirst({
      where: { ownerId: owner.id, name: d.name, status: { in: ['PENDING', 'RETURNED'] } },
    });
    if (again)
      throw badRequest('Validation failed', {
        fieldErrors: { name: [`You already sent "${d.name}" (${again.code}). It is waiting for review.`] },
      });
    const reg = await prisma.$transaction(async (tx) => {
      const c = await tx.farmRegistration.create({
        data: {
          code: tempCode(),
          ownerId: owner.id,
          name: d.name,
          type: d.type,
          barangay: d.barangay,
          zone: d.zone ?? null,
          address: d.address ?? null,
          lat: d.lat,
          lng: d.lng,
          gpsAccuracy: d.gpsAccuracy ?? null,
          livestock: d.livestock,
        },
      });
      return tx.farmRegistration.update({ where: { id: c.id }, data: { code: displayCode('REG', c.id) } });
    });
    await logActivity(
      'owner',
      owner.id,
      'farm-registration',
      `${owner.fullName} sent farm registration ${reg.code} (${reg.name})`,
      owner.fullName,
    );
    res.status(201).json(reg);
  }),
);

/** Correct and send again a registration that is still pending or was returned. */
myRouter.patch(
  '/registrations/:id',
  ah(async (req, res) => {
    const d = parse(farmRegistrationSchema, req.body);
    checkPin(d.lat, d.lng);
    const reg = await prisma.farmRegistration.findFirst({ where: { id: idParam(req), ownerId: me(req) } });
    if (!reg) throw notFound('Registration');
    if (!['PENDING', 'RETURNED'].includes(reg.status))
      throw badRequest('This registration was already decided and can no longer be changed.');
    const r = await prisma.farmRegistration.update({
      where: { id: reg.id },
      data: {
        name: d.name,
        type: d.type,
        barangay: d.barangay,
        zone: d.zone ?? null,
        address: d.address ?? null,
        lat: d.lat,
        lng: d.lng,
        gpsAccuracy: d.gpsAccuracy ?? null,
        livestock: d.livestock,
        status: 'PENDING',
        returnReason: null,
      },
    });
    res.json(r);
  }),
);

myRouter.get(
  '/farms/:id',
  ah(async (req, res) => {
    const farm = await myFarm(req, idParam(req));
    const [groups, requests, services] = await Promise.all([
      prisma.populationGroup.findMany({
        where: { farmId: farm.id, archived: false },
        orderBy: { id: 'asc' },
      }),
      prisma.populationRequest.findMany({ where: { farmId: farm.id }, orderBy: { id: 'desc' }, take: 30 }),
      prisma.vaccination.findMany({
        where: { farmId: farm.id, voidedAt: null },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 30,
      }),
    ]);
    res.json({
      id: farm.id,
      code: farm.code,
      name: farm.name,
      type: farm.type,
      barangay: farm.barangay,
      address: farm.address,
      lat: farm.lat,
      lng: farm.lng,
      status: farm.archived ? 'INACTIVE' : 'VERIFIED',
      livestock: groups.map((g) => ({ species: g.species, count: g.count, lastVerified: g.lastVerified })),
      requests,
      services: services.map((v) => ({
        id: v.id,
        date: ymd(v.date),
        service: SERVICE_TYPE_LABELS[v.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? v.serviceType,
        product: v.vaccine,
        species: v.species,
        heads: v.count,
        by: v.administeredBy,
        nextDate: ymd(v.nextDate),
      })),
    });
  }),
);

/* ---------------- head count ---------------- */

myRouter.post(
  '/population',
  ah(async (req, res) => {
    const d = parse(populationRequestSchema, req.body);
    const farm = await myFarm(req, d.farmId);
    if (farm.archived) throw badRequest('This farm is inactive. Contact the City Veterinary Office.');
    const reason = d.reason as PopReason;
    if (reason !== 'CORRECTION' && d.quantity < 1)
      throw badRequest('Validation failed', { fieldErrors: { quantity: ['Enter at least 1'] } });
    const group = await prisma.populationGroup.findFirst({
      where: { farmId: farm.id, species: d.species, archived: false },
      orderBy: { id: 'asc' },
    });
    const before = group?.count ?? 0;
    const delta = requestedDelta(reason, d.quantity, before);
    if (delta === 0)
      throw badRequest('Validation failed', {
        fieldErrors: { quantity: [`The record already shows ${before} ${d.species}.`] },
      });
    if (before + delta < 0)
      throw badRequest('Validation failed', {
        fieldErrors: {
          quantity: [
            `Only ${before} ${d.species} are recorded on ${farm.name}, so ${d.quantity} cannot be removed.`,
          ],
        },
      });
    const waiting = await prisma.populationRequest.findFirst({
      where: { farmId: farm.id, species: d.species, status: 'PENDING' },
    });
    if (waiting)
      throw badRequest(
        `An earlier ${d.species} update for ${farm.name} is still waiting for review. Wait for it, or cancel it first.`,
      );
    const s = await getSettings();
    const flag = flagReason(delta, before, s);
    const by = req.user!.name;
    const out = await prisma.$transaction(async (tx) => {
      const r = await tx.populationRequest.create({
        data: {
          ownerId: me(req),
          farmId: farm.id,
          groupId: group?.id ?? null,
          species: d.species,
          reason,
          quantity: delta,
          before,
          after: before + delta,
          note: d.note ?? null,
          flagged: !!flag,
          flagReason: flag,
          createdBy: by,
        },
      });
      // Normal changes are accepted at once; unusual ones wait for a reviewer.
      if (!flag) await applyPopulationRequest(tx, r, 'System');
      return tx.populationRequest.findUnique({ where: { id: r.id } });
    });
    res.status(201).json(out);
  }),
);

myRouter.get(
  '/population',
  ah(async (req, res) => {
    const rows = await prisma.populationRequest.findMany({
      where: { ownerId: me(req) },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const farms = await prisma.farm.findMany({
      where: { ownerId: me(req) },
      select: { id: true, name: true },
    });
    res.json(
      rows.map((r) => ({
        ...r,
        farmName: farms.find((f) => f.id === r.farmId)?.name ?? '',
        reasonLabel: POP_REASON_LABELS[r.reason as PopReason] ?? r.reason,
      })),
    );
  }),
);

/** An owner may cancel their own update while it is still waiting for review. */
myRouter.post(
  '/population/:id/cancel',
  ah(async (req, res) => {
    const r = await prisma.populationRequest.findFirst({ where: { id: idParam(req), ownerId: me(req) } });
    if (!r) throw notFound('Update');
    if (r.status !== 'PENDING') throw badRequest('This update was already decided.');
    await prisma.populationRequest.update({
      where: { id: r.id },
      data: {
        status: 'CANCELLED',
        decidedBy: req.user!.name,
        decidedAt: new Date(),
        decisionNote: 'Cancelled by the owner',
      },
    });
    res.json({ ok: true });
  }),
);

/* ---------------- disease reports ---------------- */

const reportInclude = { messages: { orderBy: { id: 'asc' as const } } };

/** What the owner may see of a case on their own farm: the stage, results and actions. No staff notes. */
async function caseForOwner(caseId: number, ownerId: number) {
  const c = await prisma.diseaseCase.findFirst({
    where: { id: caseId, ownerId, voidedAt: null },
    include: {
      farm: { select: { name: true } },
      labRecords: { where: { voidedAt: null }, orderBy: { id: 'asc' } },
      responses: { orderBy: { date: 'asc' } },
      assignedTo: { select: { name: true } },
    },
  });
  if (!c) return null;
  const stage = stageOfCase(c);
  return {
    id: c.id,
    code: c.code,
    disease: c.disease,
    species: c.species,
    farmName: c.farm.name,
    reportedAt: ymd(c.reportedAt),
    stage,
    stageLabel: CASE_STAGE_LABELS[stage],
    assignedTo: c.assignedTo?.name ?? null,
    closedAt: c.closedAt,
    closureOutcome: c.closureOutcome,
    labResults: c.labRecords.map((l) => ({
      sampleId: l.sampleId,
      sampleType: l.sampleType,
      test: l.testMethod,
      collectedAt: ymd(l.collectedAt),
      result: l.result,
      resultDate: ymd(l.resultDate),
    })),
    actions: c.responses
      .filter((r) => !r.voidedAt)
      .map((r) => ({
        type: r.type,
        status: r.status,
        date: ymd(r.date),
        endDate: ymd(r.endDate),
        heads: r.heads,
      })),
  };
}

myRouter.get(
  '/reports',
  ah(async (req, res) => {
    const ownerId = me(req);
    const [reports, cases, farms] = await Promise.all([
      prisma.diseaseReport.findMany({ where: { ownerId }, orderBy: { id: 'desc' } }),
      prisma.diseaseCase.findMany({
        where: { ownerId, voidedAt: null },
        include: { responses: true, farm: { select: { name: true } } },
        orderBy: { id: 'desc' },
      }),
      prisma.farm.findMany({ where: { ownerId }, select: { id: true, name: true } }),
    ]);
    const linked = new Set(reports.map((r) => r.caseId).filter(Boolean));
    const stageFor = (r: (typeof reports)[number]): CaseStage => {
      if (r.status === 'REJECTED') return 'REJECTED';
      if (r.status === 'INFO_REQUESTED') return 'INFO_REQUESTED';
      const c = r.caseId ? cases.find((x) => x.id === r.caseId) : null;
      return c ? stageOfCase(c) : 'REPORTED';
    };
    res.json([
      ...reports.map((r) => {
        const stage = stageFor(r);
        return {
          key: String(r.id),
          code: r.code,
          farmName: farms.find((f) => f.id === r.farmId)?.name ?? '',
          species: r.species,
          affected: r.affected,
          date: r.createdAt,
          stage,
          stageLabel: CASE_STAGE_LABELS[stage],
          caseCode: cases.find((c) => c.id === r.caseId)?.code ?? null,
        };
      }),
      // Cases the office recorded itself for this owner's farm (a report by phone, for example).
      ...cases
        .filter((c) => !linked.has(c.id))
        .map((c) => {
          const stage = stageOfCase(c);
          return {
            key: `case-${c.id}`,
            code: c.code,
            farmName: c.farm.name,
            species: c.species,
            affected: c.affected,
            date: c.createdAt,
            stage,
            stageLabel: CASE_STAGE_LABELS[stage],
            caseCode: c.code,
          };
        }),
    ]);
  }),
);

myRouter.get(
  '/reports/:key',
  ah(async (req, res) => {
    const ownerId = me(req);
    const key = String(req.params.key);
    if (key.startsWith('case-')) {
      const c = await caseForOwner(Number(key.slice(5)), ownerId);
      if (!c) throw notFound('Report');
      return res.json({ report: null, case: c, stage: c.stage, stageLabel: c.stageLabel });
    }
    const r = await prisma.diseaseReport.findFirst({
      where: { id: Number(key) || 0, ownerId },
      include: reportInclude,
    });
    if (!r) throw notFound('Report');
    const c = r.caseId ? await caseForOwner(r.caseId, ownerId) : null;
    const farm = await prisma.farm.findUnique({ where: { id: r.farmId }, select: { name: true } });
    const stage: CaseStage =
      r.status === 'REJECTED'
        ? 'REJECTED'
        : r.status === 'INFO_REQUESTED'
          ? 'INFO_REQUESTED'
          : (c?.stage ?? 'REPORTED');
    res.json({
      report: {
        id: r.id,
        code: r.code,
        farmName: farm?.name ?? '',
        species: r.species,
        symptoms: r.symptoms,
        signs: r.signs ?? [],
        affected: r.affected,
        deaths: r.deaths,
        observedAt: ymd(r.observedAt),
        createdAt: r.createdAt,
        photos: fileUrls(r.photoKeys),
        status: r.status,
        rejectReason: r.rejectReason,
        messages: r.messages.map((m) => ({
          id: m.id,
          fromOwner: m.fromOwner,
          // Staff are shown as the office, not by name.
          by: m.fromOwner ? 'You' : 'City Veterinary Office',
          text: m.text,
          photos: fileUrls(m.photoKeys),
          at: m.createdAt,
        })),
      },
      case: c,
      stage,
      stageLabel: CASE_STAGE_LABELS[stage],
    });
  }),
);

myRouter.post(
  '/reports',
  ah(async (req, res) => {
    const d = parse(diseaseReportSchema, req.body);
    const farm = await myFarm(req, d.farmId);
    if (farm.archived) throw badRequest('This farm is inactive. Contact the City Veterinary Office.');
    const open = await prisma.diseaseReport.findFirst({
      where: { farmId: farm.id, species: d.species, status: { in: ['REPORTED', 'INFO_REQUESTED'] } },
    });
    if (open)
      throw new HttpError(
        409,
        `You already sent report ${open.code} for the ${d.species} on ${farm.name} and it is still being reviewed. Open it and add a reply instead of sending it again.`,
        { reportId: open.id },
      );
    // The phone's location when it is on and inside the city; otherwise the farm's own location.
    const gps = d.lat != null && d.lng != null && insideNaga(d.lat, d.lng);
    const lat = gps ? d.lat! : farm.lat;
    const lng = gps ? d.lng! : farm.lng;
    const distance =
      gps && farm.lat != null && farm.lng != null
        ? Math.round(distanceMeters(d.lat!, d.lng!, farm.lat, farm.lng))
        : null;
    const owner = await prisma.owner.findUnique({ where: { id: me(req) } });
    const r = await prisma.$transaction(async (tx) => {
      const c = await tx.diseaseReport.create({
        data: {
          code: tempCode(),
          ownerId: me(req),
          farmId: farm.id,
          species: d.species,
          symptoms: d.symptoms,
          signs: d.signs,
          affected: d.affected,
          deaths: d.deaths,
          observedAt: dateOnly(d.observedAt ?? isoDate())!,
          photoKeys: d.photoKeys,
          lat,
          lng,
          gpsAccuracy: gps ? (d.gpsAccuracy ?? null) : null,
          locationSource: gps ? 'PHONE_GPS' : 'FARM',
          distanceFromFarm: distance,
        },
      });
      const rr = await tx.diseaseReport.update({
        where: { id: c.id },
        data: { code: displayCode('RPT', c.id) },
      });
      await logActivity(
        'farm',
        farm.id,
        'disease-report',
        `${owner?.fullName} reported sick ${d.species} at ${farm.name} (${rr.code}, ${d.affected} affected)`,
        owner?.fullName,
        tx,
      );
      return rr;
    });
    await notifyOwner(me(req), {
      type: 'REPORT',
      title: `Report ${r.code} received`,
      body: `The City Veterinary Office received your report for ${farm.name}. Keep the sick animals away from the others and do not move, sell or slaughter them. You will be told here when the office replies.`,
      link: `/app/reports/${r.id}`,
    });
    res.status(201).json(r);
  }),
);

/** The owner answers a question from the office; the report goes back to the reviewer. */
myRouter.post(
  '/reports/:id/reply',
  ah(async (req, res) => {
    const d = parse(reportReplySchema, req.body);
    const r = await prisma.diseaseReport.findFirst({ where: { id: idParam(req), ownerId: me(req) } });
    if (!r) throw notFound('Report');
    if (!['REPORTED', 'INFO_REQUESTED'].includes(r.status))
      throw badRequest('This report was already decided. Send a new report if there is a new problem.');
    await prisma.$transaction([
      prisma.reportMessage.create({
        data: {
          reportId: r.id,
          fromOwner: true,
          byName: req.user!.name,
          text: d.text,
          photoKeys: d.photoKeys,
        },
      }),
      prisma.diseaseReport.update({ where: { id: r.id }, data: { status: 'REPORTED' } }),
    ]);
    res.status(201).json({ ok: true });
  }),
);

/* ---------------- alerts, notifications, announcements ---------------- */

myRouter.get(
  '/alerts',
  ah(async (req, res) => {
    res.json(await myAlerts(me(req)));
  }),
);

myRouter.get(
  '/notifications',
  ah(async (req, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    res.json(rows);
  }),
);

myRouter.post(
  '/notifications/read',
  ah(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(Number).filter(Boolean) : null;
    const r = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.json({ read: r.count });
  }),
);

/* ---------------- messages with the office ---------------- */

/** The thread: messages and the owner's transactions. Opening it marks everything in it as read. */
myRouter.get(
  '/messages',
  ah(async (req, res) => {
    const ownerId = me(req);
    const items = await ownerThread(ownerId, 'owner');
    await Promise.all([
      prisma.ownerMessage.updateMany({
        where: { ownerId, fromOwner: false, readAt: null },
        data: { readAt: new Date() },
      }),
      prisma.notification.updateMany({
        where: { userId: req.user!.id, readAt: null, type: { in: THREAD_TYPES } },
        data: { readAt: new Date() },
      }),
    ]);
    res.json({ items });
  }),
);

myRouter.post(
  '/messages',
  ah(async (req, res) => {
    const d = parse(ownerMessageSchema, req.body);
    if (d.photoKeys.some((k) => k.startsWith('ids/')))
      throw badRequest('Validation failed', { fieldErrors: { photoKeys: ['Attach the photo again'] } });
    const m = await prisma.ownerMessage.create({
      data: {
        ownerId: me(req),
        fromOwner: true,
        byName: req.user!.name,
        byUserId: req.user!.id,
        text: d.text,
        photoKeys: d.photoKeys,
      },
    });
    res.status(201).json(m);
  }),
);

myRouter.get(
  '/announcements',
  ah(async (req, res) => {
    const ownerId = me(req);
    const [owner, farms, alerts] = await Promise.all([
      prisma.owner.findUnique({ where: { id: ownerId }, select: { barangay: true } }),
      prisma.farm.findMany({ where: { ownerId, archived: false }, select: { barangay: true } }),
      myAlerts(ownerId),
    ]);
    const barangays = [
      ...new Set([owner?.barangay, ...farms.map((f) => f.barangay)].filter(Boolean) as string[]),
    ];
    const rows = await prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { audience: 'ALL' },
          { audience: 'BARANGAY', barangay: { in: barangays } },
          { audience: 'ZONE', zoneId: { in: alerts.map((a) => a.zoneId) } },
        ],
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    res.json(
      rows.map((a) => ({ id: a.id, code: a.code, title: a.title, body: a.body, publishedAt: a.publishedAt })),
    );
  }),
);

myRouter.get(
  '/settings',
  ah(async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { notifPrefs: true, phone: true, email: true },
    });
    res.json({ muted: (u?.notifPrefs as { muted?: string[] } | null)?.muted ?? [], phone: u?.phone ?? null });
  }),
);
myRouter.put(
  '/settings',
  ah(async (req, res) => {
    const d = parse(notifPrefsSchema, req.body);
    await prisma.user.update({ where: { id: req.user!.id }, data: { notifPrefs: { muted: d.muted } } });
    res.json({ muted: d.muted });
  }),
);

/* ---------------- vaccination ---------------- */

myRouter.get(
  '/vaccination',
  ah(async (req, res) => {
    const ownerId = me(req);
    const farms = await prisma.farm.findMany({
      where: { ownerId, archived: false },
      include: { groups: { where: { archived: false, count: { gt: 0 } } } },
    });
    const barangays = [...new Set(farms.map((f) => f.barangay))];
    const [activities, signups, submitted, records, requests] = await Promise.all([
      prisma.vaccinationActivity.findMany({
        where: {
          status: { in: ['SCHEDULED', 'ONGOING'] },
          date: { gte: dateOnly(isoDate()) },
          barangay: { in: [...barangays, 'ALL'] },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.activitySignup.findMany({
        where: { ownerId },
        include: { activity: true },
        orderBy: { id: 'desc' },
      }),
      prisma.ownerVaccination.findMany({ where: { ownerId }, orderBy: { id: 'desc' } }),
      prisma.vaccination.findMany({
        where: { farmId: { in: farms.map((f) => f.id) }, voidedAt: null },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      prisma.serviceRequest.findMany({ where: { ownerId }, orderBy: { id: 'desc' } }),
    ]);
    const farmName = (id: number) => farms.find((f) => f.id === id)?.name ?? '';
    res.json({
      farms: farms.map((f) => ({
        id: f.id,
        name: f.name,
        livestock: f.groups.map((g) => ({ species: g.species, count: g.count })),
      })),
      activities: activities.map((a) => ({
        ...a,
        date: ymd(a.date),
        mySignups: signups.filter((s) => s.activityId === a.id && s.status !== 'CANCELLED'),
      })),
      signups: signups.map((s) => ({
        id: s.id,
        activityId: s.activityId,
        title: s.activity.title,
        date: ymd(s.activity.date),
        farmName: farmName(s.farmId),
        species: s.species,
        heads: s.heads,
        status: s.status,
        activityStatus: s.activity.status,
      })),
      submitted: submitted.map((v) => ({
        ...v,
        date: ymd(v.date),
        farmName: farmName(v.farmId),
        proof: fileUrls(v.proofKeys),
      })),
      records: records.map((v) => ({
        id: v.id,
        date: ymd(v.date),
        service: SERVICE_TYPE_LABELS[v.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? v.serviceType,
        product: v.vaccine,
        species: v.species,
        heads: v.count,
        farmName: farmName(v.farmId),
        nextDate: ymd(v.nextDate),
      })),
      requests: requests.map((r) => ({
        ...r,
        preferredDate: ymd(r.preferredDate),
        scheduledDate: ymd(r.scheduledDate),
        farmName: farmName(r.farmId),
        serviceLabel: SERVICE_TYPE_LABELS[r.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? r.serviceType,
      })),
    });
  }),
);

myRouter.post(
  '/activities/:id/signup',
  ah(async (req, res) => {
    const d = parse(signupSchema, req.body);
    const farm = await myFarm(req, d.farmId);
    const a = await prisma.vaccinationActivity.findUnique({ where: { id: idParam(req) } });
    if (!a || a.status !== 'SCHEDULED') throw badRequest('This activity is no longer open for sign-up.');
    if (a.barangay !== 'ALL' && a.barangay !== farm.barangay)
      throw badRequest('Validation failed', {
        fieldErrors: { farmId: [`This activity is for farms in ${a.barangay}.`] },
      });
    if (a.species !== 'All' && a.species !== d.species)
      throw badRequest('Validation failed', {
        fieldErrors: { species: [`This activity is for ${a.species}.`] },
      });
    const g = await prisma.populationGroup.findMany({
      where: { farmId: farm.id, species: d.species, archived: false },
    });
    const head = g.reduce((x, y) => x + y.count, 0);
    if (d.heads > head)
      throw badRequest('Validation failed', {
        fieldErrors: {
          heads: [`${farm.name} has only ${head} ${d.species} on record. Update your head count first.`],
        },
      });
    const s = await prisma.activitySignup.upsert({
      where: { activityId_farmId_species: { activityId: a.id, farmId: farm.id, species: d.species } },
      create: { activityId: a.id, ownerId: me(req), farmId: farm.id, species: d.species, heads: d.heads },
      update: { heads: d.heads, status: 'SIGNED_UP' },
    });
    res.status(201).json(s);
  }),
);

myRouter.post(
  '/signups/:id/cancel',
  ah(async (req, res) => {
    const s = await prisma.activitySignup.findFirst({ where: { id: idParam(req), ownerId: me(req) } });
    if (!s) throw notFound('Sign-up');
    if (s.status !== 'SIGNED_UP') throw badRequest('This sign-up can no longer be cancelled.');
    await prisma.activitySignup.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });
    res.json({ ok: true });
  }),
);

/** A vaccination given outside a CVO activity, sent with proof for the office to verify. */
myRouter.post(
  '/vaccinations',
  ah(async (req, res) => {
    const d = parse(ownerVaccinationSchema, req.body);
    const farm = await myFarm(req, d.farmId);
    const v = await prisma.ownerVaccination.create({
      data: {
        ownerId: me(req),
        farmId: farm.id,
        species: d.species,
        vaccine: d.vaccine,
        date: dateOnly(d.date)!,
        heads: d.heads,
        givenBy: d.givenBy,
        proofKeys: d.proofKeys,
      },
    });
    res.status(201).json(v);
  }),
);

myRouter.post(
  '/service-requests',
  ah(async (req, res) => {
    const d = parse(serviceRequestSchema, req.body);
    const farm = await myFarm(req, d.farmId);
    if (d.preferredDate && d.preferredDate < isoDate())
      throw badRequest('Validation failed', {
        fieldErrors: { preferredDate: ['Choose today or a later date'] },
      });
    const r = await prisma.$transaction(async (tx) => {
      const c = await tx.serviceRequest.create({
        data: {
          code: tempCode(),
          ownerId: me(req),
          farmId: farm.id,
          serviceType: d.serviceType,
          species: d.species ?? null,
          note: d.note ?? null,
          preferredDate: dateOnly(d.preferredDate) ?? null,
        },
      });
      return tx.serviceRequest.update({ where: { id: c.id }, data: { code: displayCode('SRQ', c.id) } });
    });
    res.status(201).json(r);
  }),
);

/* ---------------- farm summary ---------------- */

/** The owner's own registration and farm summary (to show or print as proof of registration). */
myRouter.get(
  '/summary',
  ah(async (req, res) => {
    const ownerId = me(req);
    const [owner, farms, settings] = await Promise.all([
      prisma.owner.findUnique({ where: { id: ownerId } }),
      prisma.farm.findMany({
        where: { ownerId, archived: false },
        orderBy: { id: 'asc' },
        include: {
          groups: { where: { archived: false, count: { gt: 0 } }, orderBy: { id: 'asc' } },
          vaccinations: { where: { voidedAt: null }, orderBy: { date: 'desc' }, take: 20 },
        },
      }),
      getSettings(),
    ]);
    if (!owner) throw notFound('Owner');
    if (req.query.log === '1')
      await audit({
        tableName: 'Report',
        recordId: owner.code,
        action: 'EXPORT',
        note: `Farm summary of ${owner.fullName} downloaded by the owner`,
      });
    res.json({
      office: { name: settings.officeName, address: settings.officeAddress, contact: settings.officeContact },
      owner: {
        code: owner.code,
        fullName: owner.fullName,
        barangay: owner.barangay,
        zone: owner.zone,
        street: owner.street,
        contact: owner.contact,
        rsbsa: owner.rsbsa,
        status: owner.status,
        registeredAt: owner.registeredAt,
      },
      farms: farms.map((f) => ({
        code: f.code,
        name: f.name,
        type: f.type,
        barangay: f.barangay,
        address: f.address,
        livestock: f.groups.map((g) => ({ species: g.species, count: g.count })),
        total: f.groups.reduce((a, g) => a + g.count, 0),
        services: f.vaccinations.map((v) => ({
          date: ymd(v.date),
          service: SERVICE_TYPE_LABELS[v.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? v.serviceType,
          product: v.vaccine,
          species: v.species,
          heads: v.count,
        })),
      })),
      generatedAt: new Date(),
    });
  }),
);
