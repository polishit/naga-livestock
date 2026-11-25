import { Router } from 'express';
import {
  VISIT_FINDING_LABELS,
  VISIT_PURPOSE_LABELS,
  farmVisitCreateSchema,
  farmVisitUpdateSchema,
  type VisitFinding,
  type VisitPurpose,
  voidSchema,
} from '@livestock/shared';
import { requireReviewer } from '../auth/auth';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { assertNotFuture, dateOnly, today } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse, qstr } from '../lib/http';
import { serializeVisit } from './serializers';

/** Field visits: the office's main field activity (masterlist updates, deworming, check-ups, monitoring). */
export const visitsRouter = Router();

const include = {
  farm: { select: { name: true, barangay: true } },
  case: { select: { code: true, disease: true } },
} as const;

visitsRouter.get(
  '/',
  ah(async (req, res) => {
    const farmId = Number(req.query.farmId) || undefined;
    const caseId = Number(req.query.caseId) || undefined;
    const barangay = qstr(req.query.barangay);
    const purpose = qstr(req.query.purpose);
    const from = qstr(req.query.from);
    const to = qstr(req.query.to);
    const rows = await prisma.farmVisit.findMany({
      where: {
        voidedAt: null,
        ...(farmId ? { farmId } : {}),
        ...(caseId ? { caseId } : {}),
        ...(purpose ? { purpose } : {}),
        ...(barangay ? { farm: { barangay } } : {}),
        ...(from || to
          ? { date: { ...(from ? { gte: dateOnly(from) } : {}), ...(to ? { lte: dateOnly(to) } : {}) } }
          : {}),
      },
      include,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    res.json(rows.map(serializeVisit));
  }),
);

/** Checks shared by create and edit: the farm is active, the case exists and is not voided. */
async function checkLinks(farmId: number, caseId?: number | null) {
  const farm = await prisma.farm.findUnique({ where: { id: farmId } });
  if (!farm) throw badRequest('Validation failed', { fieldErrors: { farmId: ['Select a farm'] } });
  if (farm.archived)
    throw badRequest('Validation failed', { fieldErrors: { farmId: ['This farm is archived'] } });
  if (caseId) {
    const c = await prisma.diseaseCase.findUnique({ where: { id: caseId } });
    if (!c || c.voidedAt)
      throw badRequest('Validation failed', { fieldErrors: { caseId: ['Select a disease case'] } });
  }
  return farm;
}

visitsRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(farmVisitCreateSchema, req.body);
    assertNotFuture({ date: d.date });
    const farm = await checkLinks(d.farmId, d.caseId);
    const v = await prisma.$transaction(async (tx) => {
      const created = await tx.farmVisit.create({
        data: {
          code: tempCode(),
          farmId: farm.id,
          caseId: d.caseId ?? null,
          date: dateOnly(d.date ?? today())!,
          purpose: d.purpose,
          findings: d.findings,
          visitedBy: d.visitedBy ?? req.user?.name ?? null,
          remarks: d.remarks ?? null,
          createdBy: req.user?.name ?? null,
        },
      });
      const saved = await tx.farmVisit.update({
        where: { id: created.id },
        data: { code: displayCode('VIS', created.id) },
        include,
      });
      await logActivity(
        'farm',
        farm.id,
        'visit',
        `Field visit ${saved.code}: ${VISIT_PURPOSE_LABELS[d.purpose as VisitPurpose]} — ${
          VISIT_FINDING_LABELS[d.findings as VisitFinding]
        }`,
        req.user?.name,
        tx,
      );
      return saved;
    });
    res.status(201).json(serializeVisit(v));
  }),
);

visitsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(farmVisitUpdateSchema, req.body);
    assertNotFuture({ date: d.date });
    const before = await prisma.farmVisit.findUnique({ where: { id } });
    if (!before || before.voidedAt) throw notFound('Field visit');
    await checkLinks(before.farmId, d.caseId);
    const v = await prisma.farmVisit.update({
      where: { id },
      data: {
        ...(d.date ? { date: dateOnly(d.date)! } : {}),
        ...(d.purpose ? { purpose: d.purpose } : {}),
        ...(d.findings ? { findings: d.findings } : {}),
        ...(d.caseId !== undefined ? { caseId: d.caseId ?? null } : {}),
        ...(d.visitedBy !== undefined ? { visitedBy: d.visitedBy ?? null } : {}),
        ...(d.remarks !== undefined ? { remarks: d.remarks ?? null } : {}),
      },
      include,
    });
    await logActivity('farm', v.farmId, 'visit-edited', `Field visit ${v.code} edited`, req.user?.name);
    res.json(serializeVisit(v));
  }),
);

/**
 * A visit entered by mistake is voided with a reason: it stays in the database and in the audit
 * trail, and leaves every list and figure. Nothing is deleted.
 */
visitsRouter.post(
  '/:id/void',
  requireReviewer,
  ah(async (req, res) => {
    const id = idParam(req);
    const { reason } = parse(voidSchema, req.body);
    const v = await prisma.farmVisit.findUnique({ where: { id } });
    if (!v) throw notFound('Field visit');
    if (v.voidedAt) throw badRequest('This visit is already voided');
    await prisma.farmVisit.update({
      where: { id },
      data: { voidedAt: new Date(), voidedBy: req.user?.name ?? null, voidReason: reason },
    });
    await logActivity(
      'farm',
      v.farmId,
      'visit-voided',
      `Field visit ${v.code} voided: ${reason}`,
      req.user?.name,
    );
    res.json({ ok: true });
  }),
);
