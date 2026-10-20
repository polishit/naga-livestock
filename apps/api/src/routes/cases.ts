import { Router } from 'express';
import {
  CASE_STATUS_CODES,
  CASE_STATUS_LABELS,
  RESPONSE_TYPE_LABELS,
  caseCloseSchema,
  caseCreateSchema,
  caseLocationSchema,
  caseStatusSchema,
  investigationCreateSchema,
  labCreateSchema,
  responseCreateSchema,
  type ResponseType,
} from '@livestock/shared';
import { requireRole } from '../auth/auth';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, today, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse, qstr } from '../lib/http';
import { loadCases, radiusAnalysis } from '../services/metrics';
import { serializeCase } from './serializers';

export const casesRouter = Router();
export const labsRouter = Router();
export const radiusRouter = Router();

/** Closed cases are read-only until an administrator reopens them. */
const closedError = () => badRequest('This case is closed. Reopen it first to make changes.');

casesRouter.get(
  '/',
  ah(async (req, res) => {
    const location = qstr(req.query.location);
    let rows = (
      await loadCases({
        barangay: qstr(req.query.barangay),
        caseStatus: qstr(req.query.status),
        species: qstr(req.query.species),
      })
    ).map(serializeCase);
    if (location === 'mapped') rows = rows.filter((r) => r.mapped);
    if (location === 'unmapped') rows = rows.filter((r) => !r.mapped);
    // state=open → active cases only; state=closed → finished cases only; anything else → all.
    const state = qstr(req.query.state);
    if (state === 'open') rows = rows.filter((r) => !r.closed);
    if (state === 'closed') rows = rows.filter((r) => r.closed);
    res.json(rows);
  }),
);

casesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const c = await prisma.diseaseCase.findUnique({
      where: { id },
      include: {
        farm: true,
        owner: true,
        assignedTo: true,
        relatedCase: true,
        linkedCases: { include: { farm: true }, orderBy: { id: 'asc' } },
        history: { orderBy: [{ at: 'desc' }, { id: 'desc' }] },
        investigations: { orderBy: [{ date: 'desc' }, { id: 'desc' }] },
        labRecords: { orderBy: { id: 'asc' } },
        responses: { orderBy: [{ date: 'desc' }, { id: 'desc' }] },
      },
    });
    if (!c) throw notFound('Case');
    const radius = c.lat != null ? await radiusAnalysis(id) : null;
    res.json({
      case: serializeCase(c),
      history: c.history.map((h) => ({
        id: h.id,
        status: h.status,
        label: CASE_STATUS_LABELS[h.status],
        note: h.note,
        byName: h.byName,
        at: h.at,
      })),
      investigations: c.investigations.map((i) => ({
        id: i.id,
        date: ymd(i.date),
        investigator: i.investigator,
        notes: i.notes,
      })),
      labs: c.labRecords.map(serializeLab),
      responses: c.responses.map(serializeResponse),
      linkedCases: c.linkedCases.map((l) => ({
        id: l.id,
        code: l.code,
        disease: l.disease,
        status: l.status,
        closed: l.closedAt != null,
        farmName: l.farm.name,
        barangay: l.barangay,
        reportedAt: ymd(l.reportedAt),
      })),
      context:
        radius && radius.geocoded
          ? {
              radius: radius.radius,
              farms: radius.totals!.farms,
              livestock: radius.totals!.livestock,
              owners: radius.totals!.owners,
            }
          : null,
    });
  }),
);

function serializeLab(l: any) {
  return {
    id: l.id,
    caseId: l.caseId,
    caseCode: l.case?.code,
    sampleId: l.sampleId,
    sampleType: l.sampleType,
    collectedAt: ymd(l.collectedAt),
    laboratory: l.laboratory,
    sentAt: ymd(l.sentAt),
    result: l.result,
    resultDate: ymd(l.resultDate),
    remarks: l.remarks,
  };
}

function serializeResponse(r: any) {
  return {
    id: r.id,
    type: r.type,
    typeLabel: RESPONSE_TYPE_LABELS[r.type as ResponseType] ?? r.type,
    date: ymd(r.date),
    personnel: r.personnel,
    remarks: r.remarks,
  };
}

casesRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(caseCreateSchema, req.body);
    const farm = await prisma.farm.findUnique({ where: { id: d.farmId } });
    if (!farm || farm.ownerId !== d.ownerId)
      throw badRequest('Validation failed', {
        fieldErrors: { farmId: ['Farm does not belong to the selected owner'] },
      });
    let lat = d.lat ?? null;
    let lng = d.lng ?? null;
    let source: string | null = null;
    if (lat != null && lng != null) {
      source = farm.lat === lat && farm.lng === lng ? 'Farm Coordinates' : 'Pinned on map';
    } else if (farm.lat != null && farm.lng != null) {
      lat = farm.lat;
      lng = farm.lng;
      source = 'Farm Coordinates';
    }
    if (d.relatedCaseId) {
      const parent = await prisma.diseaseCase.findUnique({ where: { id: d.relatedCaseId } });
      if (!parent) throw badRequest('The linked case no longer exists');
    }
    const reportedAt = d.reportedAt ?? today();
    const c = await prisma.$transaction(async (tx) => {
      const created = await tx.diseaseCase.create({
        data: {
          code: tempCode(),
          ownerId: d.ownerId,
          farmId: d.farmId,
          barangay: farm.barangay,
          zone: d.zone ?? farm.zone,
          species: d.species,
          disease: d.disease,
          affected: d.affected,
          deaths: d.deaths,
          symptomsDate: dateOnly(d.symptomsDate) ?? null,
          reportedAt: dateOnly(reportedAt)!,
          symptoms: d.symptoms ?? null,
          reportedBy: d.reportedBy ?? null,
          assignedToId: d.assignedToId ?? null,
          sampleInfo: d.sampleInfo ?? null,
          remarks: d.remarks ?? null,
          lat,
          lng,
          locationSource: source,
          photoKeys: d.photoKeys ?? [],
          relatedCaseId: d.relatedCaseId ?? null,
        },
      });
      const cc = await tx.diseaseCase.update({
        where: { id: created.id },
        data: { code: displayCode('CASE', created.id) },
      });
      await tx.caseStatusHistory.create({
        data: { caseId: cc.id, status: 'SUSPECTED', note: 'Case reported', byName: req.user?.name },
      });
      await logActivity(
        'case',
        cc.id,
        'reported',
        `Disease case ${cc.code} reported (${cc.disease})`,
        req.user?.name,
        tx,
      );
      if (d.relatedCaseId) {
        await logActivity(
          'case',
          d.relatedCaseId,
          'linked',
          `Linked incident ${cc.code} reported at ${farm.name}`,
          req.user?.name,
          tx,
        );
      }
      return cc;
    });
    res.status(201).json(c);
  }),
);

casesRouter.post(
  '/:id/status',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(caseStatusSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    if (c.status === d.status)
      throw badRequest('Validation failed', { fieldErrors: { status: ['Case already has this status'] } });
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.diseaseCase.update({ where: { id }, data: { status: d.status } });
      await tx.caseStatusHistory.create({
        data: {
          caseId: id,
          status: d.status,
          note: d.note ?? `Advanced to ${CASE_STATUS_CODES[d.status]}`,
          byName: req.user?.name,
        },
      });
      const summary =
        d.status === 'POSITIVE'
          ? `${c.code} confirmed POSITIVE — ${c.disease}`
          : d.status === 'NEGATIVE'
            ? `${c.code} confirmed negative — ${c.disease}`
            : `${c.code} moved to ${CASE_STATUS_LABELS[d.status]}`;
      await logActivity('case', id, 'status', summary, req.user?.name, tx);
      return u;
    });
    res.json(updated);
  }),
);

casesRouter.patch(
  '/:id/location',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(caseLocationSchema, req.body);
    const existing = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!existing) throw notFound('Case');
    if (existing.closedAt) throw closedError();
    const c = await prisma.diseaseCase.update({
      where: { id },
      data: { lat: d.lat, lng: d.lng, locationSource: 'Pinned on map' },
    });
    await logActivity(
      'case',
      id,
      'geotagged',
      `${c.code} location set (${d.lat.toFixed(5)}, ${d.lng.toFixed(5)})`,
      req.user?.name,
    );
    res.json(c);
  }),
);

casesRouter.post(
  '/:id/investigations',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(investigationCreateSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    const i = await prisma.investigation.create({
      data: {
        caseId: id,
        date: dateOnly(d.date ?? today())!,
        investigator: d.investigator ?? req.user?.name ?? null,
        notes: d.notes,
      },
    });
    await logActivity('case', id, 'investigation', `Investigation recorded for ${c.code}`, req.user?.name);
    res.status(201).json(i);
  }),
);

casesRouter.post(
  '/:id/labs',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(labCreateSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    const l = await prisma.labRecord.create({
      data: {
        caseId: id,
        sampleId: d.sampleId,
        sampleType: d.sampleType ?? null,
        collectedAt: dateOnly(d.collectedAt) ?? null,
        laboratory: d.laboratory ?? null,
        sentAt: dateOnly(d.sentAt) ?? null,
        result: d.result,
        resultDate: dateOnly(d.resultDate) ?? null,
        remarks: d.remarks ?? null,
      },
    });
    await logActivity(
      'case',
      id,
      'lab',
      `Lab record ${l.sampleId} added to ${c.code} (${d.result.toLowerCase()})`,
      req.user?.name,
    );
    res.status(201).json(l);
  }),
);

casesRouter.post(
  '/:id/responses',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(responseCreateSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    const r = await prisma.responseActivity.create({
      data: {
        caseId: id,
        type: d.type,
        date: dateOnly(d.date ?? today())!,
        personnel: d.personnel ?? null,
        remarks: d.remarks ?? null,
      },
    });
    await logActivity(
      'case',
      id,
      'response',
      `${RESPONSE_TYPE_LABELS[d.type]} logged for ${c.code}`,
      req.user?.name,
    );
    res.status(201).json(r);
  }),
);

casesRouter.post(
  '/:id/close',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(caseCloseSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw badRequest('This case is already closed');
    if (c.status !== 'POSITIVE' && c.status !== 'NEGATIVE') {
      throw badRequest('Only cases with a final result (Positive or Negative) can be closed');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.diseaseCase.update({
        where: { id },
        data: { closedAt: new Date(), closedBy: req.user?.name ?? null, closureNote: d.note },
      });
      await tx.caseStatusHistory.create({
        data: { caseId: id, status: c.status, note: `Case closed — ${d.note}`, byName: req.user?.name },
      });
      await logActivity('case', id, 'closed', `${c.code} closed (${c.disease})`, req.user?.name, tx);
      return u;
    });
    res.json(updated);
  }),
);

casesRouter.post(
  '/:id/reopen',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (!c.closedAt) throw badRequest('This case is not closed');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.diseaseCase.update({
        where: { id },
        data: { closedAt: null, closedBy: null, closureNote: null },
      });
      await tx.caseStatusHistory.create({
        data: { caseId: id, status: c.status, note: 'Case reopened', byName: req.user?.name },
      });
      await logActivity('case', id, 'reopened', `${c.code} reopened`, req.user?.name, tx);
      return u;
    });
    res.json(updated);
  }),
);

labsRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.labRecord.findMany({
      include: { case: true },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    });
    res.json(rows.map(serializeLab));
  }),
);

radiusRouter.get(
  '/',
  ah(async (req, res) => {
    const caseId = Number(req.query.caseId);
    if (!caseId) throw badRequest('caseId is required');
    const r = await radiusAnalysis(caseId, Number(req.query.radius) || undefined);
    if (!r) throw notFound('Case');
    res.json({
      case: serializeCase({ ...r.case, farm: r.case.farm, owner: r.case.owner }),
      radius: r.radius,
      geocoded: r.geocoded,
      center: r.geocoded ? r.center : null,
      farms: r.farms,
      totals: r.totals,
      excluded: r.excluded,
    });
  }),
);