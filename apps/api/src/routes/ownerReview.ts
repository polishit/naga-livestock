import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import {
  FARM_CHECKS,
  ID_TYPE_LABELS,
  OWNER_CHECKS,
  REPORT_CHECKS,
  VACC_CHECKS,
  hasAll,
  type IdType,
  POP_REASON_LABELS,
  SERVICE_TYPE_LABELS,
  decisionSchema,
  distanceMeters,
  fmtDate,
  isoDate,
  normalizePhone,
  ownerAccountSchema,
  populationDecisionSchema,
  registrationDecisionSchema,
  reportReviewSchema,
  roundDistance,
  serviceRequestUpdateSchema,
  type PopReason,
} from '@livestock/shared';
import { forgetUserState, requireReviewer } from '../auth/auth';
import { audit, prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, ymd } from '../lib/dates';
import { HttpError, ah, badRequest, idParam, notFound, parse } from '../lib/http';
import {
  applyPopulationRequest,
  approveFarmRegistration,
  farmsInCircle,
  notifyOwner,
  notifyZone,
  stageOfCase,
} from '../services/ownerSide';
import { getSettings } from '../services/settings';

/**
 * The CVO review queue: everything livestock owners send from the owner app waits here for a
 * reviewer (System Administrator or Veterinarian). All staff can look; only reviewers decide.
 */
export const reviewRouter = Router();

/** Refuse a decision when the reviewer has not confirmed every checklist item. */
function needChecks(got: string[] | undefined, need: readonly string[]) {
  if (!hasAll(got, need))
    throw badRequest('Validation failed', {
      fieldErrors: { checklist: ['Confirm every item in the checklist before verifying'] },
    });
}

const daysAgo = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);
const urls = (keys: unknown) =>
  ((keys as string[] | null) ?? []).map((k) => ({ key: k, url: `/api/files/${k}` }));

export function temporaryPassword() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const pick = (set: string, n: number) =>
    Array.from(crypto.randomBytes(n), (b) => set[b % set.length]).join('');
  return `${pick(letters, 4)}-${pick('23456789', 4)}-${pick(letters, 2)}`;
}

/** How many items wait in each queue (for the menu badge and the dashboard). */
export async function reviewCounts() {
  const [owners, farms, population, reports, vaccinations, services] = await Promise.all([
    prisma.owner.count({ where: { status: 'PENDING', returnReason: null } }),
    prisma.farmRegistration.count({ where: { status: 'PENDING' } }),
    prisma.populationRequest.count({ where: { status: 'PENDING' } }),
    prisma.diseaseReport.count({ where: { status: 'REPORTED' } }),
    prisma.ownerVaccination.count({ where: { status: 'SUBMITTED' } }),
    prisma.serviceRequest.count({ where: { status: 'REQUESTED' } }),
  ]);
  return {
    owners,
    farms,
    population,
    reports,
    vaccinations,
    services,
    total: owners + farms + population + reports + vaccinations + services,
  };
}

reviewRouter.get(
  '/summary',
  ah(async (_req, res) => {
    res.json(await reviewCounts());
  }),
);

/* ---------------- registrations ---------------- */

reviewRouter.get(
  '/registrations',
  ah(async (_req, res) => {
    const s = await getSettings();
    const [owners, regs] = await Promise.all([
      prisma.owner.findMany({
        where: { status: 'PENDING' },
        orderBy: { registeredAt: 'asc' },
        include: {
          account: { select: { phone: true, email: true, lastLoginAt: true } },
          farmRegistrations: {
            where: { status: { in: ['PENDING', 'RETURNED'] } },
            select: { id: true, code: true, name: true, status: true },
          },
        },
      }),
      prisma.farmRegistration.findMany({
        where: { status: { in: ['PENDING', 'RETURNED'] } },
        orderBy: { submittedAt: 'asc' },
        include: { owner: { select: { id: true, code: true, fullName: true, status: true, contact: true } } },
      }),
    ]);
    // Possible duplicates of a new owner: same name in the same barangay, or the same mobile number.
    const others = owners.length
      ? await prisma.owner.findMany({
          where: {
            status: { not: 'PENDING' },
            OR: owners.flatMap((o) => [
              { fullName: o.fullName, barangay: o.barangay },
              ...(o.contact ? [{ contact: o.contact }] : []),
            ]),
          },
          select: { id: true, code: true, fullName: true, barangay: true, contact: true, status: true },
        })
      : [];
    const farms = regs.length
      ? await prisma.farm.findMany({
          where: { lat: { not: null }, lng: { not: null } },
          select: { id: true, code: true, name: true, lat: true, lng: true, ownerId: true, archived: true },
        })
      : [];
    const history = owners.length
      ? await prisma.activityLog.findMany({
          where: { entity: 'owner', entityId: { in: owners.map((o) => o.id) } },
          orderBy: { id: 'asc' },
          select: { entityId: true, action: true, summary: true, byName: true, createdAt: true },
        })
      : [];
    res.json({
      reviewDays: s.reviewDays,
      owners: owners.map((o) => ({
        id: o.id,
        code: o.code,
        fullName: o.fullName,
        barangay: o.barangay,
        zone: o.zone,
        street: o.street,
        contact: o.contact,
        email: o.email,
        rsbsa: o.rsbsa,
        registeredAt: o.registeredAt,
        submittedAt: o.submittedAt ?? o.registeredAt,
        waitingDays: daysAgo(o.submittedAt ?? o.registeredAt),
        overdue: !o.returnReason && daysAgo(o.submittedAt ?? o.registeredAt) > s.reviewDays,
        returnReason: o.returnReason,
        reviewedBy: o.reviewedBy,
        reviewedAt: o.reviewedAt,
        idType: o.idType,
        idTypeLabel: o.idType ? (ID_TYPE_LABELS[o.idType as IdType] ?? o.idType) : null,
        idNumber: o.idNumber,
        idPhotos: urls(o.idPhotoKeys),
        account: o.account,
        farmRegistrations: o.farmRegistrations,
        history: history.filter((h) => h.entityId === o.id),
        duplicates: others.filter(
          (x) =>
            (x.fullName === o.fullName && x.barangay === o.barangay) ||
            (!!o.contact && x.contact === o.contact),
        ),
      })),
      farms: regs.map((r) => ({
        ...r,
        waitingDays: daysAgo(r.submittedAt),
        overdue: r.status === 'PENDING' && daysAgo(r.submittedAt) > s.reviewDays,
        // Another farm already pinned within 30 m: the same farm may be registered twice.
        nearby: farms
          .map((f) => ({
            id: f.id,
            code: f.code,
            name: f.name,
            sameOwner: f.ownerId === r.ownerId,
            distance:
              r.lat != null && r.lng != null
                ? roundDistance(distanceMeters(r.lat, r.lng, f.lat!, f.lng!))
                : 9e9,
          }))
          .filter((f) => f.distance <= 30),
      })),
    });
  }),
);

reviewRouter.post(
  '/owners/:id',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(registrationDecisionSchema, req.body);
    const o = await prisma.owner.findUnique({ where: { id: idParam(req) } });
    if (!o) throw notFound('Owner');
    if (o.status !== 'PENDING') throw badRequest('This registration was already decided.');
    const by = req.user!.name;
    if (d.decision === 'APPROVE') {
      if (o.selfRegistered && !((o.idPhotoKeys as string[] | null) ?? []).length)
        throw badRequest('This owner has not sent an ID. Return the registration and ask for one.');
      needChecks(d.checklist, OWNER_CHECKS);
      await prisma.owner.update({
        where: { id: o.id },
        data: {
          status: 'ACTIVE',
          returnReason: null,
          reviewedBy: by,
          reviewedAt: new Date(),
          verifyChecklist: d.checklist,
        },
      });
      await logActivity('owner', o.id, 'verified', `Owner ${o.code} (${o.fullName}) verified`, by);
      await notifyOwner(o.id, {
        type: 'REGISTRATION',
        title: 'Your registration is verified',
        body: `The City Veterinary Office verified your registration. Your registration number is ${o.code}.`,
        link: '/app',
      });
    } else if (d.decision === 'RETURN') {
      await prisma.owner.update({
        where: { id: o.id },
        data: { returnReason: d.reason!, reviewedBy: by, reviewedAt: new Date() },
      });
      await logActivity(
        'owner',
        o.id,
        'returned',
        `Registration of ${o.fullName} returned for correction: ${d.reason}`,
        by,
      );
      await notifyOwner(o.id, {
        type: 'REGISTRATION',
        title: 'Please correct your registration',
        body: `The City Veterinary Office returned your registration: ${d.reason}\n\nOpen Verification, correct it and send it again.`,
        link: '/app/more/verification',
      });
    } else {
      await prisma.owner.update({
        where: { id: o.id },
        data: { status: 'INACTIVE', returnReason: d.reason!, reviewedBy: by, reviewedAt: new Date() },
      });
      await logActivity(
        'owner',
        o.id,
        'inactive',
        `Registration of ${o.fullName} set inactive: ${d.reason}`,
        by,
      );
      await notifyOwner(o.id, {
        type: 'REGISTRATION',
        title: 'Your registration was not accepted',
        body: `The City Veterinary Office did not accept your registration: ${d.reason}\n\nVisit or call the office if you think this is a mistake.`,
        link: '/app',
      });
    }
    res.json({ ok: true });
  }),
);

reviewRouter.post(
  '/farms/:id',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(registrationDecisionSchema, req.body);
    const reg = await prisma.farmRegistration.findUnique({
      where: { id: idParam(req) },
      include: { owner: true },
    });
    if (!reg) throw notFound('Registration');
    if (reg.status !== 'PENDING') throw badRequest('This registration is not waiting for review.');
    const by = req.user!.name;
    if (d.decision === 'APPROVE') {
      // A farm cannot be verified under an owner who is not verified yet.
      if (reg.owner.status !== 'ACTIVE')
        throw badRequest(`Verify the owner (${reg.owner.fullName}) first, then the farm.`);
      needChecks(d.checklist, FARM_CHECKS);
      const farm = await prisma.$transaction(async (tx) => {
        await tx.farmRegistration.update({ where: { id: reg.id }, data: { verifyChecklist: d.checklist } });
        return approveFarmRegistration(tx, reg.id, by);
      });
      await notifyOwner(reg.ownerId, {
        type: 'REGISTRATION',
        title: `${farm.name} is verified`,
        body: `Your farm ${farm.name} is verified. Its registration number is ${farm.code}. You can now update its head count and report sick animals.`,
        link: `/app/farms/${farm.id}`,
      });
      // A farm registered inside an active monitoring zone is alerted like the others.
      if (farm.lat != null && farm.lng != null) {
        const zones = await prisma.monitoringZone.findMany({ where: { status: 'ACTIVE' } });
        for (const z of zones)
          if (distanceMeters(z.lat, z.lng, farm.lat, farm.lng) <= z.radiusM) await notifyZone(z);
      }
      return res.json({ ok: true, farmId: farm.id });
    }
    const status = d.decision === 'RETURN' ? 'RETURNED' : 'INACTIVE';
    await prisma.farmRegistration.update({
      where: { id: reg.id },
      data: { status, returnReason: d.reason!, reviewedBy: by, reviewedAt: new Date() },
    });
    await logActivity(
      'owner',
      reg.ownerId,
      status === 'RETURNED' ? 'farm-returned' : 'farm-inactive',
      `Farm registration ${reg.code} (${reg.name}) ${status === 'RETURNED' ? 'returned for correction' : 'set inactive'}: ${d.reason}`,
      by,
    );
    await notifyOwner(reg.ownerId, {
      type: 'REGISTRATION',
      title: status === 'RETURNED' ? `Please correct ${reg.name}` : `${reg.name} was not accepted`,
      body:
        status === 'RETURNED'
          ? `The City Veterinary Office returned the registration of ${reg.name}: ${d.reason}\n\nOpen it, correct it and send it again.`
          : `The City Veterinary Office did not accept the registration of ${reg.name}: ${d.reason}`,
      link: '/app/farms',
    });
    res.json({ ok: true });
  }),
);

/* ---------------- head count updates ---------------- */

reviewRouter.get(
  '/population',
  ah(async (req, res) => {
    const all = req.query.all === '1';
    const rows = await prisma.populationRequest.findMany({
      where: all ? {} : { status: 'PENDING' },
      orderBy: all ? { id: 'desc' } : { id: 'asc' },
      take: 200,
    });
    const [farms, owners] = await Promise.all([
      prisma.farm.findMany({
        where: { id: { in: rows.map((r) => r.farmId) } },
        select: { id: true, code: true, name: true, barangay: true },
      }),
      prisma.owner.findMany({
        where: { id: { in: rows.map((r) => r.ownerId) } },
        select: { id: true, fullName: true, contact: true },
      }),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        reasonLabel: POP_REASON_LABELS[r.reason as PopReason] ?? r.reason,
        farm: farms.find((f) => f.id === r.farmId),
        owner: owners.find((o) => o.id === r.ownerId),
        waitingDays: daysAgo(r.createdAt),
      })),
    );
  }),
);

reviewRouter.post(
  '/population/:id',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(populationDecisionSchema, req.body);
    const r = await prisma.populationRequest.findUnique({ where: { id: idParam(req) } });
    if (!r) throw notFound('Update');
    if (r.status !== 'PENDING') throw badRequest('This update was already decided.');
    const by = req.user!.name;
    const farm = await prisma.farm.findUnique({ where: { id: r.farmId }, select: { name: true } });
    if (d.decision === 'ACCEPT' && r.flagged && !d.reason)
      throw badRequest('Validation failed', {
        fieldErrors: { reason: ['This change was flagged: write how you confirmed it'] },
      });
    if (d.decision === 'ACCEPT') {
      const out = await prisma.$transaction(async (tx) => {
        const x = await applyPopulationRequest(tx, r, by);
        await tx.populationRequest.update({ where: { id: r.id }, data: { decisionNote: d.reason ?? null } });
        return x;
      });
      await notifyOwner(r.ownerId, {
        type: 'POPULATION',
        title: 'Head count update accepted',
        body: `Your ${r.species} count for ${farm?.name} is now ${out.after} (was ${out.before}).`,
        link: `/app/farms/${r.farmId}`,
      });
    } else {
      await prisma.populationRequest.update({
        where: { id: r.id },
        data: { status: 'CANCELLED', decidedBy: by, decidedAt: new Date(), decisionNote: d.reason! },
      });
      await logActivity(
        'farm',
        r.farmId,
        'population-cancelled',
        `${farm?.name}: owner's ${r.species} update cancelled: ${d.reason}`,
        by,
      );
      await notifyOwner(r.ownerId, {
        type: 'POPULATION',
        title: 'Head count update not accepted',
        body: `Your ${r.species} update for ${farm?.name} was not accepted: ${d.reason}\n\nThe recorded count stays at ${r.before}.`,
        link: `/app/farms/${r.farmId}`,
      });
    }
    res.json({ ok: true });
  }),
);

/* ---------------- disease reports ---------------- */

reviewRouter.get(
  '/reports',
  ah(async (req, res) => {
    const all = req.query.all === '1';
    const rows = await prisma.diseaseReport.findMany({
      where: all ? {} : { status: { in: ['REPORTED', 'INFO_REQUESTED'] } },
      orderBy: all ? { id: 'desc' } : { createdAt: 'asc' },
      take: 200,
      include: { owner: { select: { id: true, fullName: true, contact: true } } },
    });
    const farms = await prisma.farm.findMany({
      where: { id: { in: rows.map((r) => r.farmId) } },
      select: { id: true, code: true, name: true, barangay: true },
    });
    const s = await getSettings();
    res.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        species: r.species,
        affected: r.affected,
        deaths: r.deaths,
        createdAt: r.createdAt,
        waitingDays: daysAgo(r.createdAt),
        overdue: r.status === 'REPORTED' && daysAgo(r.createdAt) > s.reviewDays,
        owner: r.owner,
        farm: farms.find((f) => f.id === r.farmId),
        caseId: r.caseId,
      })),
    );
  }),
);

reviewRouter.get(
  '/reports/:id',
  ah(async (req, res) => {
    const r = await prisma.diseaseReport.findUnique({
      where: { id: idParam(req) },
      include: {
        owner: { select: { id: true, code: true, fullName: true, contact: true, barangay: true } },
        messages: { orderBy: { id: 'asc' } },
      },
    });
    if (!r) throw notFound('Report');
    const [farm, groups, openCases, linked] = await Promise.all([
      prisma.farm.findUnique({ where: { id: r.farmId } }),
      prisma.populationGroup.findMany({ where: { farmId: r.farmId, species: r.species, archived: false } }),
      // Possible duplicates: other open cases on the same farm.
      prisma.diseaseCase.findMany({
        where: { farmId: r.farmId, closedAt: null, voidedAt: null },
        select: { id: true, code: true, disease: true, species: true, reportedAt: true, status: true },
      }),
      r.caseId
        ? prisma.diseaseCase.findUnique({ where: { id: r.caseId }, include: { responses: true } })
        : null,
    ]);
    const head = groups.reduce((a, g) => a + g.count, 0);
    res.json({
      ...r,
      observedAt: ymd(r.observedAt),
      photos: urls(r.photoKeys),
      messages: r.messages.map((m) => ({ ...m, photos: urls(m.photoKeys) })),
      farm: farm && {
        id: farm.id,
        code: farm.code,
        name: farm.name,
        barangay: farm.barangay,
        lat: farm.lat,
        lng: farm.lng,
      },
      recordedHead: head,
      // Things the reviewer should look at before deciding.
      flags: [
        r.affected > head
          ? `Reports ${r.affected} affected but the farm has ${head} ${r.species} on record.`
          : null,
        r.locationSource === 'FARM'
          ? "Phone GPS was off or outside the city: the farm's own location is used."
          : null,
        r.distanceFromFarm != null && r.distanceFromFarm > 1000
          ? `Sent ${(r.distanceFromFarm / 1000).toFixed(1)} km away from the farm.`
          : null,
        openCases.filter((c) => c.id !== r.caseId).length
          ? 'This farm already has an open disease case: check that this is not the same incident.'
          : null,
      ].filter(Boolean),
      openCases: openCases.map((c) => ({ ...c, reportedAt: ymd(c.reportedAt) })),
      case: linked && {
        id: linked.id,
        code: linked.code,
        disease: linked.disease,
        stage: stageOfCase(linked),
      },
    });
  }),
);

reviewRouter.post(
  '/reports/:id',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(reportReviewSchema, req.body);
    const r = await prisma.diseaseReport.findUnique({
      where: { id: idParam(req) },
      include: { owner: true },
    });
    if (!r) throw notFound('Report');
    if (!['REPORTED', 'INFO_REQUESTED'].includes(r.status))
      throw badRequest('This report was already decided.');
    const by = req.user!.name;
    const farm = await prisma.farm.findUnique({ where: { id: r.farmId } });
    if (!farm) throw notFound('Farm');
    const link = `/app/reports/${r.id}`;
    if (d.decision === 'VALIDATE') needChecks(d.checklist, REPORT_CHECKS);
    if (d.visitDate && d.visitDate < isoDate())
      throw badRequest('Validation failed', {
        fieldErrors: { visitDate: ['The visit date cannot be in the past'] },
      });

    if (d.decision === 'REQUEST_INFO') {
      await prisma.$transaction([
        prisma.reportMessage.create({
          data: { reportId: r.id, fromOwner: false, byName: by, text: d.message! },
        }),
        prisma.diseaseReport.update({
          where: { id: r.id },
          data: {
            status: 'INFO_REQUESTED',
            reviewedBy: by,
            reviewedAt: new Date(),
            assessment: d.assessment ?? r.assessment,
          },
        }),
      ]);
      await notifyOwner(r.ownerId, {
        type: 'REPORT',
        title: `Question about report ${r.code}`,
        body: `The City Veterinary Office asks: ${d.message}\n\nOpen the report and reply.`,
        link,
      });
      return res.json({ ok: true });
    }
    if (d.decision === 'REJECT') {
      await prisma.diseaseReport.update({
        where: { id: r.id },
        data: {
          status: 'REJECTED',
          rejectReason: d.message!.slice(0, 300),
          assessment: d.assessment ?? r.assessment,
          reviewedBy: by,
          reviewedAt: new Date(),
        },
      });
      await logActivity(
        'farm',
        farm.id,
        'report-rejected',
        `Owner report ${r.code} rejected: ${d.message}`,
        by,
      );
      await notifyOwner(r.ownerId, {
        type: 'REPORT',
        title: `Report ${r.code} was not accepted`,
        body: `The City Veterinary Office did not accept your report for ${farm.name}: ${d.message}\n\nIf your animals get worse, send a new report or call the office.`,
        link,
      });
      return res.json({ ok: true });
    }

    // VALIDATE: attach to an existing open case on the farm, or open a new case.
    if (d.assignedToId) {
      const u = await prisma.user.findUnique({ where: { id: d.assignedToId } });
      if (!u || u.status !== 'ACTIVE' || u.role === 'OWNER')
        throw badRequest('Validation failed', {
          fieldErrors: { assignedToId: ['Select an active staff member'] },
        });
    }
    const c = await prisma.$transaction(async (tx) => {
      let cc;
      if (d.caseId) {
        cc = await tx.diseaseCase.findUnique({ where: { id: d.caseId } });
        if (!cc || cc.farmId !== r.farmId || cc.closedAt || cc.voidedAt)
          throw badRequest('Validation failed', {
            fieldErrors: { caseId: ['Select an open case on this farm'] },
          });
        await tx.caseStatusHistory.create({
          data: {
            caseId: cc.id,
            status: cc.status,
            note: `Owner report ${r.code} attached (same incident). Assessment: ${d.assessment}`.slice(
              0,
              300,
            ),
            byName: by,
          },
        });
      } else {
        const created = await tx.diseaseCase.create({
          data: {
            code: tempCode(),
            ownerId: r.ownerId,
            farmId: r.farmId,
            barangay: farm.barangay,
            zone: farm.zone,
            species: r.species,
            disease: d.disease!,
            affected: r.affected,
            deaths: r.deaths,
            symptomsDate: r.observedAt,
            reportedAt: dateOnly(isoDate(r.createdAt))!,
            symptoms: r.symptoms,
            clinicalSigns: (r.signs as string[] | null) ?? [],
            reportedBy: `${r.owner.fullName} (owner app)`,
            assignedToId: d.assignedToId ?? req.user!.id,
            lat: r.lat ?? farm.lat,
            lng: r.lng ?? farm.lng,
            locationSource: r.locationSource === 'PHONE_GPS' ? 'Owner phone GPS' : 'Farm Coordinates',
            photoKeys: (r.photoKeys as string[] | null) ?? [],
          },
        });
        cc = await tx.diseaseCase.update({
          where: { id: created.id },
          data: { code: displayCode('CASE', created.id) },
        });
        await tx.caseStatusHistory.create({
          data: {
            caseId: cc.id,
            status: 'SUSPECTED',
            note: `Opened from owner report ${r.code}, validated by ${by}. Field visit planned ${d.visitDate ? fmtDate(d.visitDate) : '(not set)'}. Assessment: ${d.assessment}`.slice(
              0,
              300,
            ),
            byName: by,
          },
        });
        await logActivity(
          'case',
          cc.id,
          'reported',
          `Disease case ${cc.code} opened from owner report ${r.code} (${cc.disease})`,
          by,
          tx,
        );
      }
      await tx.diseaseReport.update({
        where: { id: r.id },
        data: {
          status: 'VALIDATED',
          caseId: cc.id,
          reviewedBy: by,
          reviewedAt: new Date(),
          assessment: d.assessment,
          visitDate: dateOnly(d.visitDate) ?? null,
        },
      });
      if (d.message)
        await tx.reportMessage.create({
          data: { reportId: r.id, fromOwner: false, byName: by, text: d.message },
        });
      return cc;
    });
    await notifyOwner(r.ownerId, {
      type: 'REPORT',
      title: `Report ${r.code} accepted: under investigation`,
      body: `The City Veterinary Office accepted your report for ${farm.name} (case ${c.code}). ${d.visitDate ? `Staff will visit your farm on ${fmtDate(d.visitDate)}.` : 'Staff will visit or contact you.'} Keep the sick animals apart and do not move, sell or slaughter them.${d.message ? `\n\n${d.message}` : ''}`,
      link,
    });
    res.json({ ok: true, caseId: c.id, caseCode: c.code });
  }),
);

/* ---------------- owner-submitted vaccinations and service requests ---------------- */

reviewRouter.get(
  '/vaccinations',
  ah(async (req, res) => {
    const all = req.query.all === '1';
    const rows = await prisma.ownerVaccination.findMany({
      where: all ? {} : { status: 'SUBMITTED' },
      orderBy: { id: all ? 'desc' : 'asc' },
      take: 200,
    });
    const [farms, owners] = await Promise.all([
      prisma.farm.findMany({
        where: { id: { in: rows.map((r) => r.farmId) } },
        select: { id: true, code: true, name: true, barangay: true },
      }),
      prisma.owner.findMany({
        where: { id: { in: rows.map((r) => r.ownerId) } },
        select: { id: true, fullName: true, contact: true },
      }),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        date: ymd(r.date),
        proof: urls(r.proofKeys),
        farm: farms.find((f) => f.id === r.farmId),
        owner: owners.find((o) => o.id === r.ownerId),
      })),
    );
  }),
);

reviewRouter.post(
  '/vaccinations/:id',
  requireReviewer,
  ah(async (req, res) => {
    const d = parse(decisionSchema, req.body);
    const v = await prisma.ownerVaccination.findUnique({ where: { id: idParam(req) } });
    if (!v) throw notFound('Record');
    if (v.status !== 'SUBMITTED') throw badRequest('This record was already decided.');
    if (d.decision === 'VERIFY') needChecks(d.checklist, VACC_CHECKS);
    const by = req.user!.name;
    const farm = await prisma.farm.findUnique({ where: { id: v.farmId } });
    if (d.decision === 'REJECT') {
      await prisma.ownerVaccination.update({
        where: { id: v.id },
        data: { status: 'REJECTED', reason: d.reason!, decidedBy: by, decidedAt: new Date() },
      });
      await notifyOwner(v.ownerId, {
        type: 'VACCINATION',
        title: 'Vaccination record not accepted',
        body: `Your ${v.vaccine} record for ${farm?.name} was not accepted: ${d.reason}`,
        link: '/app/vaccination',
      });
      return res.json({ ok: true });
    }
    // Verified: it becomes an official vaccination record of the farm.
    const group = await prisma.populationGroup.findFirst({
      where: { farmId: v.farmId, species: v.species, archived: false },
      orderBy: { count: 'desc' },
    });
    if (!group) throw badRequest(`${farm?.name} has no ${v.species} on record. Update the head count first.`);
    const rec = await prisma.$transaction(async (tx) => {
      const c = await tx.vaccination.create({
        data: {
          code: tempCode(),
          farmId: v.farmId,
          target: 'GROUP',
          groupId: group.id,
          species: v.species,
          count: Math.min(v.heads, group.count),
          serviceType: 'VACCINATION',
          vaccine: v.vaccine,
          date: v.date,
          administeredBy: v.givenBy,
          remarks: `Submitted by the owner; verified by ${by}`,
        },
      });
      const x = await tx.vaccination.update({
        where: { id: c.id },
        data: { code: displayCode('VAC', c.id) },
      });
      await tx.ownerVaccination.update({
        where: { id: v.id },
        data: {
          status: 'VERIFIED',
          vaccinationId: x.id,
          decidedBy: by,
          decidedAt: new Date(),
          reason: d.reason ?? null,
        },
      });
      await logActivity(
        'farm',
        v.farmId,
        'vaccination',
        `${x.code}: ${v.vaccine} for ${x.count} ${v.species} (owner-submitted, verified)`,
        by,
        tx,
      );
      return x;
    });
    await notifyOwner(v.ownerId, {
      type: 'VACCINATION',
      title: 'Vaccination record verified',
      body: `Your ${v.vaccine} record for ${farm?.name} (${fmtDate(v.date)}) is now on your farm's official record.`,
      link: '/app/vaccination',
    });
    res.json({ ok: true, vaccinationId: rec.id });
  }),
);

reviewRouter.get(
  '/service-requests',
  ah(async (req, res) => {
    const all = req.query.all === '1';
    const rows = await prisma.serviceRequest.findMany({
      where: all ? {} : { status: { in: ['REQUESTED', 'SCHEDULED'] } },
      orderBy: { id: all ? 'desc' : 'asc' },
      take: 200,
    });
    const [farms, owners] = await Promise.all([
      prisma.farm.findMany({
        where: { id: { in: rows.map((r) => r.farmId) } },
        select: { id: true, code: true, name: true, barangay: true },
      }),
      prisma.owner.findMany({
        where: { id: { in: rows.map((r) => r.ownerId) } },
        select: { id: true, fullName: true, contact: true },
      }),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        preferredDate: ymd(r.preferredDate),
        scheduledDate: ymd(r.scheduledDate),
        serviceLabel: SERVICE_TYPE_LABELS[r.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? r.serviceType,
        farm: farms.find((f) => f.id === r.farmId),
        owner: owners.find((o) => o.id === r.ownerId),
      })),
    );
  }),
);

/** Any staff member can schedule, finish or decline a service request. */
reviewRouter.post(
  '/service-requests/:id',
  ah(async (req, res) => {
    const d = parse(serviceRequestUpdateSchema, req.body);
    const r = await prisma.serviceRequest.findUnique({ where: { id: idParam(req) } });
    if (!r) throw notFound('Request');
    if (['DONE', 'DECLINED'].includes(r.status)) throw badRequest('This request is already finished.');
    if (d.status === 'DONE' && r.status !== 'SCHEDULED')
      throw badRequest('Schedule the visit first, then mark it done after the visit.');
    if (d.status === 'SCHEDULED' && d.scheduledDate! < isoDate())
      throw badRequest('Validation failed', {
        fieldErrors: { scheduledDate: ['The date cannot be in the past'] },
      });
    const farm = await prisma.farm.findUnique({ where: { id: r.farmId }, select: { name: true } });
    const label = SERVICE_TYPE_LABELS[r.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? r.serviceType;
    await prisma.serviceRequest.update({
      where: { id: r.id },
      data: {
        status: d.status,
        scheduledDate: d.status === 'SCHEDULED' ? dateOnly(d.scheduledDate)! : r.scheduledDate,
        scheduledTime: d.status === 'SCHEDULED' ? (d.scheduledTime ?? null) : r.scheduledTime,
        response: d.response ?? r.response,
        handledBy: req.user!.name,
      },
    });
    const text = {
      SCHEDULED: [
        `${label} scheduled`,
        `Your request (${r.code}) for ${farm?.name} is scheduled on ${fmtDate(d.scheduledDate!)}${d.scheduledTime ? `, ${d.scheduledTime}` : ''}.${d.response ? ` ${d.response}` : ''}`,
      ],
      DONE: [
        `${label} done`,
        `Your request (${r.code}) for ${farm?.name} is marked done.${d.response ? ` ${d.response}` : ''}`,
      ],
      DECLINED: [
        `${label} request declined`,
        `Your request (${r.code}) for ${farm?.name} was declined: ${d.response}`,
      ],
    }[d.status];
    await notifyOwner(r.ownerId, {
      type: 'SERVICE',
      title: text[0],
      body: text[1],
      link: '/app/vaccination',
    });
    res.json({ ok: true });
  }),
);

/* ---------------- owner logins ---------------- */

/** Owner logins (for the review page): who has the app, and who was sent which alerts. */
reviewRouter.get(
  '/accounts',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { role: 'OWNER' },
      orderBy: { id: 'desc' },
      include: { owner: { select: { id: true, code: true, fullName: true, barangay: true, status: true } } },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        phone: u.phone,
        email: u.email.endsWith('@owner.local') ? null : u.email,
        status: u.status,
        locked: !!u.lockedUntil && u.lockedUntil > new Date(),
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        owner: u.owner,
      })),
    );
  }),
);

/**
 * Give an owner already in the masterlist a login for the owner app. The owner signs in with the
 * mobile number and the temporary password, and must set their own password.
 */
reviewRouter.post(
  '/accounts/:ownerId',
  requireReviewer,
  ah(async (req, res) => {
    const ownerId = idParam(req, 'ownerId');
    const d = parse(ownerAccountSchema, req.body);
    const phone = normalizePhone(d.phone)!;
    const owner = await prisma.owner.findUnique({ where: { id: ownerId }, include: { account: true } });
    if (!owner) throw notFound('Owner');
    if (owner.account)
      throw badRequest(
        `${owner.fullName} already has a login (${owner.account.phone ?? owner.account.email}).`,
      );
    if (owner.status !== 'ACTIVE') throw badRequest('Only an active (verified) owner can be given a login.');
    if (await prisma.user.findUnique({ where: { phone } }))
      throw badRequest('Validation failed', {
        fieldErrors: { phone: ['This mobile number already has a login'] },
      });
    const temp = temporaryPassword();
    const u = await prisma.user.create({
      data: {
        name: owner.fullName,
        email: `${phone}@owner.local`,
        phone,
        role: 'OWNER',
        ownerId: owner.id,
        passwordHash: await bcrypt.hash(temp, 10),
        mustChangePassword: true,
      },
    });
    if (!owner.contact) await prisma.owner.update({ where: { id: owner.id }, data: { contact: phone } });
    await logActivity(
      'owner',
      owner.id,
      'account',
      `Owner app login created for ${owner.fullName} (${phone})`,
      req.user!.name,
    );
    res.status(201).json({ id: u.id, phone, temporaryPassword: temp });
  }),
);

/** A forgotten password or a locked owner login: a reviewer gives a new temporary password. */
reviewRouter.post(
  '/accounts/:userId/reset-password',
  requireReviewer,
  ah(async (req, res) => {
    const id = idParam(req, 'userId');
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.role !== 'OWNER') throw new HttpError(404, 'Owner login not found');
    const temp = temporaryPassword();
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(temp, 10),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    forgetUserState(id);
    await audit({
      tableName: 'User',
      recordId: id,
      action: 'PASSWORD_RESET',
      note: `Temporary password issued for owner login ${u.phone ?? u.email}`,
    });
    res.json({ temporaryPassword: temp });
  }),
);

export { farmsInCircle };
