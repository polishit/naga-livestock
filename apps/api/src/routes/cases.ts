import { Router } from 'express';
import {
  CASE_OUTCOME_LABELS,
  CASE_STATUS_CODES,
  CASE_STATUS_LABELS,
  INVESTIGATION_VISIT_LABELS,
  RESPONSE_STATUS_LABELS,
  RESPONSE_TYPES_WITH_END,
  RESPONSE_TYPE_LABELS,
  caseCloseSchema,
  caseCreateSchema,
  caseLocationSchema,
  caseStatusSchema,
  caseUpdateSchema,
  checkCaseStatus,
  fmtDate,
  investigationCreateSchema,
  labCreateSchema,
  responseCreateSchema,
  titleCase,
  voidSchema,
  type CaseStatus,
  type ResponseType,
} from '@livestock/shared';
import { requireRole } from '../auth/auth';
import { prisma, type Prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { assertNotFuture, dateOnly, today, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse, qstr } from '../lib/http';
import { loadCases, radiusAnalysis } from '../services/metrics';
import { serializeCase } from './serializers';
import { refreshReminders } from './vaccinations';

export const casesRouter = Router();
export const labsRouter = Router();
export const radiusRouter = Router();
export const recordsRouter = Router();

/** Closed cases are read-only until an administrator reopens them. */
const closedError = () => badRequest('This case is closed. Reopen it first to make changes.');

/** Head count of one species on a farm (active groups), used to sanity-check affected animals. */
async function speciesHead(farmId: number, species: string) {
  const groups = await prisma.populationGroup.findMany({
    where: { farmId, species, archived: false },
    select: { count: true },
  });
  return { groups: groups.length, head: groups.reduce((a, g) => a + g.count, 0) };
}

/**
 * Animals affected cannot exceed the farm's head of that species. When editing a case, the animals
 * that already left the population because of it (deaths and culling reconciled) still count.
 */
async function checkAffected(
  farmId: number,
  farmName: string,
  species: string,
  affected: number,
  alreadyRemoved = 0,
) {
  const { groups, head } = await speciesHead(farmId, species);
  if (!groups && !alreadyRemoved)
    throw badRequest('Validation failed', {
      fieldErrors: {
        species: [`${farmName} has no ${species} recorded. Add a population group for it first.`],
      },
    });
  const limit = head + alreadyRemoved;
  if (affected > limit)
    throw badRequest('Validation failed', {
      fieldErrors: {
        affected: [
          alreadyRemoved
            ? `${farmName} had only ${limit} ${species} (${head} now plus ${alreadyRemoved} removed for this case).`
            : `${farmName} has only ${head} ${species} on record. Update the farm's population first if this is wrong.`,
        ],
      },
    });
}

/** Animals actually culled for a case (planned culling has not removed any animals yet). */
function culledHeads(rs: { heads: number | null; status: string; voidedAt: Date | null }[]) {
  return rs.filter((r) => !r.voidedAt && r.status !== 'PLANNED').reduce((a, r) => a + (r.heads ?? 0), 0);
}

/** Deaths plus culled heads on a case that the farm's population has not yet been updated for. */
function pendingPopulation(c: { deaths: number; populationReconciled: number }, culled: number) {
  return Math.max(0, c.deaths + culled - c.populationReconciled);
}

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
    const disease = qstr(req.query.disease);
    if (disease) rows = rows.filter((r) => r.disease === disease);
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
    const culled = culledHeads(c.responses);
    res.json({
      case: { ...serializeCase(c), culled, pendingPopulation: pendingPopulation(c, culled) },
      history: c.history.map((h) => ({
        id: h.id,
        status: h.status,
        label: CASE_STATUS_LABELS[h.status],
        note: h.note,
        byName: h.byName,
        at: h.at,
      })),
      investigations: c.investigations.map(serializeInvestigation),
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

function voidInfo(r: { voidedAt: Date | null; voidedBy: string | null; voidReason: string | null }) {
  return { voided: r.voidedAt != null, voidedBy: r.voidedBy, voidReason: r.voidReason };
}

function serializeInvestigation(i: any) {
  return {
    ...voidInfo(i),
    id: i.id,
    date: ymd(i.date),
    visitType: i.visitType,
    visitLabel:
      INVESTIGATION_VISIT_LABELS[i.visitType as keyof typeof INVESTIGATION_VISIT_LABELS] ?? i.visitType,
    investigator: i.investigator,
    animalsExamined: i.animalsExamined,
    sickCount: i.sickCount,
    deadCount: i.deadCount,
    clinicalSigns: i.clinicalSigns,
    biosecurity: i.biosecurity,
    actionsTaken: i.actionsTaken,
    samplesCollected: i.samplesCollected,
    nextVisit: ymd(i.nextVisit),
    notes: i.notes,
  };
}

function serializeLab(l: any) {
  return {
    ...voidInfo(l),
    id: l.id,
    caseId: l.caseId,
    caseCode: l.case?.code,
    caseClosed: l.case ? l.case.closedAt != null : undefined,
    sampleId: l.sampleId,
    sampleType: l.sampleType,
    sampleCount: l.sampleCount,
    testMethod: l.testMethod,
    collectedAt: ymd(l.collectedAt),
    laboratory: l.laboratory,
    labReference: l.labReference,
    submittedBy: l.submittedBy,
    sentAt: ymd(l.sentAt),
    result: l.result,
    resultDate: ymd(l.resultDate),
    remarks: l.remarks,
    updatedAt: l.updatedAt,
    updatedBy: l.updatedBy,
  };
}

function serializeResponse(r: any) {
  return {
    ...voidInfo(r),
    id: r.id,
    type: r.type,
    typeLabel: RESPONSE_TYPE_LABELS[r.type as ResponseType] ?? r.type,
    status: r.status,
    statusLabel: RESPONSE_STATUS_LABELS[r.status as keyof typeof RESPONSE_STATUS_LABELS] ?? r.status,
    date: ymd(r.date),
    endDate: ymd(r.endDate),
    location: r.location,
    personnel: r.personnel,
    remarks: r.remarks,
    heads: r.heads,
    disposalMethod: r.disposalMethod,
  };
}

casesRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(caseCreateSchema, req.body);
    assertNotFuture({ reportedAt: d.reportedAt, symptomsDate: d.symptomsDate });
    if (d.symptomsDate && d.symptomsDate > (d.reportedAt ?? today()))
      throw badRequest('Validation failed', {
        fieldErrors: { symptomsDate: ['Symptoms cannot be observed after the report date'] },
      });
    const farm = await prisma.farm.findUnique({ where: { id: d.farmId } });
    if (!farm || farm.ownerId !== d.ownerId)
      throw badRequest('Validation failed', {
        fieldErrors: { farmId: ['Farm does not belong to the selected owner'] },
      });
    if (farm.archived)
      throw badRequest('Validation failed', { fieldErrors: { farmId: ['This farm is archived'] } });
    await checkAffected(farm.id, farm.name, d.species, d.affected);
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
    const c = await prisma.diseaseCase.findUnique({
      where: { id },
      include: { labRecords: { where: { voidedAt: null } } },
    });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    const check = checkCaseStatus(
      c.status,
      d.status,
      c.labRecords.map((l) => ({ result: l.result, sentAt: ymd(l.sentAt) })),
    );
    if (!check.allowed)
      throw badRequest('Validation failed', { fieldErrors: { status: [check.reason ?? 'Not allowed'] } });
    if (check.correction) {
      if (req.user?.role !== 'ADMIN')
        throw badRequest('Validation failed', {
          fieldErrors: {
            status: ['Only an administrator can move a case backwards or change a final result'],
          },
        });
      if (!d.note || d.note.length < 5)
        throw badRequest('Validation failed', {
          fieldErrors: { note: ['Write the reason for this correction'] },
        });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.diseaseCase.update({ where: { id }, data: { status: d.status } });
      await tx.caseStatusHistory.create({
        data: {
          caseId: id,
          status: d.status,
          note: check.correction
            ? `Correction: ${d.note}`
            : (d.note ?? `Advanced to ${CASE_STATUS_CODES[d.status]}`),
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

/** First day of a case: when symptoms were seen, or the report date. Follow-up records cannot be earlier. */
function caseStart(c: { symptomsDate: Date | null; reportedAt: Date }) {
  return ymd(c.symptomsDate ?? c.reportedAt)!;
}

function notBeforeCase(
  c: { symptomsDate: Date | null; reportedAt: Date },
  fields: Record<string, string | undefined | null>,
) {
  const start = caseStart(c);
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v && v < start) fieldErrors[k] = [`Cannot be before the case began (${fmtDate(start)})`];
  }
  if (Object.keys(fieldErrors).length) throw badRequest('Validation failed', { fieldErrors });
}

/** Case history line (shown on the History tab) for changes to follow-up records. */
function historyNote(
  tx: Prisma.TransactionClient | typeof prisma,
  c: { id: number; status: CaseStatus },
  note: string,
  by?: string | null,
) {
  return tx.caseStatusHistory.create({
    data: { caseId: c.id, status: c.status, note: note.slice(0, 500), byName: by ?? null },
  });
}

/** Data for a laboratory record from the form. */
function labData(d: LabInput) {
  return {
    sampleId: d.sampleId,
    sampleType: d.sampleType ?? null,
    sampleCount: d.sampleCount ?? null,
    testMethod: d.testMethod ?? null,
    collectedAt: dateOnly(d.collectedAt) ?? null,
    laboratory: d.laboratory ?? null,
    labReference: d.labReference ?? null,
    submittedBy: d.submittedBy ?? null,
    sentAt: dateOnly(d.sentAt) ?? null,
    result: d.result,
    resultDate: dateOnly(d.resultDate) ?? null,
    remarks: d.remarks ?? null,
  };
}
type LabInput = ReturnType<typeof labCreateSchema.parse>;

/** A laboratory sample ID identifies one sample: it cannot be used twice (voided records excepted). */
async function assertUniqueSample(sampleId: string, exceptId?: number) {
  const dup = await prisma.labRecord.findFirst({
    where: { sampleId, voidedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    include: { case: true },
  });
  if (dup)
    throw badRequest('Validation failed', {
      fieldErrors: { sampleId: [`Sample ID already used on ${dup.case.code}`] },
    });
}
type ResponseInput = ReturnType<typeof responseCreateSchema.parse>;

/** Checks shared by creating and editing a response activity. */
async function checkResponse(
  c: { farmId: number; species: string; symptomsDate: Date | null; reportedAt: Date },
  d: ResponseInput,
  previousHeads = 0,
) {
  if (d.status !== 'PLANNED') assertNotFuture({ date: d.date });
  notBeforeCase(c, { date: d.date });
  if (d.type === 'CULLING_DEPOPULATION' && d.heads) {
    // Animals culled cannot exceed what the farm has of this species on record (when editing, the
    // heads this record already counted may have left the population, so they are allowed again).
    const { head } = await speciesHead(c.farmId, c.species);
    const limit = head + previousHeads;
    if (d.heads > limit) {
      throw badRequest('Validation failed', {
        fieldErrors: { heads: [`The farm has only ${limit} ${c.species.toLowerCase()} on record`] },
      });
    }
  }
}

function responseData(d: ResponseInput) {
  const isCulling = d.type === 'CULLING_DEPOPULATION';
  return {
    type: d.type,
    status: d.status,
    date: dateOnly(d.date ?? today())!,
    endDate: dateOnly(d.endDate) ?? null,
    location: d.location ?? null,
    personnel: d.personnel ?? null,
    remarks: d.remarks ?? null,
    heads: isCulling ? (d.heads ?? null) : null,
    disposalMethod: isCulling ? (d.disposalMethod ?? null) : null,
  };
}

casesRouter.post(
  '/:id/investigations',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(investigationCreateSchema, req.body);
    assertNotFuture({ date: d.date });
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    notBeforeCase(c, { date: d.date });
    const i = await prisma.$transaction(async (tx) => {
      const created = await tx.investigation.create({
        data: {
          caseId: id,
          date: dateOnly(d.date ?? today())!,
          visitType: d.visitType,
          investigator: d.investigator ?? req.user?.name ?? null,
          animalsExamined: d.animalsExamined ?? null,
          sickCount: d.sickCount ?? null,
          deadCount: d.deadCount ?? null,
          clinicalSigns: d.clinicalSigns ?? null,
          biosecurity: d.biosecurity ?? null,
          actionsTaken: d.actionsTaken ?? null,
          samplesCollected: d.samplesCollected,
          nextVisit: dateOnly(d.nextVisit) ?? null,
          notes: d.notes,
        },
      });
      await historyNote(
        tx,
        c,
        `${INVESTIGATION_VISIT_LABELS[d.visitType]} recorded${d.nextVisit ? ` — next visit ${fmtDate(d.nextVisit)}` : ''}`,
        req.user?.name,
      );
      await logActivity(
        'case',
        id,
        'investigation',
        `Investigation recorded for ${c.code}`,
        req.user?.name,
        tx,
      );
      return created;
    });
    res.status(201).json({ ...i, caseDeaths: c.deaths });
  }),
);

casesRouter.post(
  '/:id/labs',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(labCreateSchema, req.body);
    assertNotFuture({ collectedAt: d.collectedAt, sentAt: d.sentAt, resultDate: d.resultDate });
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    notBeforeCase(c, { collectedAt: d.collectedAt, sentAt: d.sentAt, resultDate: d.resultDate });
    await assertUniqueSample(d.sampleId);
    const l = await prisma.$transaction(async (tx) => {
      const created = await tx.labRecord.create({ data: { caseId: id, ...labData(d) } });
      await historyNote(
        tx,
        c,
        `Lab record ${created.sampleId} added (${titleCase(d.result)})`,
        req.user?.name,
      );
      await logActivity(
        'case',
        id,
        'lab',
        `Lab record ${created.sampleId} added to ${c.code} (${d.result.toLowerCase()})`,
        req.user?.name,
        tx,
      );
      return created;
    });
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
    await checkResponse(c, d);
    const r = await prisma.$transaction(async (tx) => {
      const created = await tx.responseActivity.create({ data: { caseId: id, ...responseData(d) } });
      await historyNote(
        tx,
        c,
        `${RESPONSE_TYPE_LABELS[d.type]} logged (${RESPONSE_STATUS_LABELS[d.status].toLowerCase()})${d.heads && d.type === 'CULLING_DEPOPULATION' ? ` — ${d.heads} culled` : ''}`,
        req.user?.name,
      );
      await logActivity(
        'case',
        id,
        'response',
        `${RESPONSE_TYPE_LABELS[d.type]} logged for ${c.code}`,
        req.user?.name,
        tx,
      );
      return created;
    });
    res.status(201).json(r);
  }),
);

casesRouter.post(
  '/:id/close',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(caseCloseSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({
      where: { id },
      include: { responses: { where: { voidedAt: null } } },
    });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw badRequest('This case is already closed');
    if (c.status !== 'POSITIVE' && c.status !== 'NEGATIVE') {
      throw badRequest('Only cases with a final result (Positive or Negative) can be closed');
    }
    const open = c.responses.filter((r) => r.status !== 'COMPLETED');
    if (open.length) {
      throw badRequest(
        `${open.length} response activit${open.length === 1 ? 'y is' : 'ies are'} still planned or ongoing. Mark ${open.length === 1 ? 'it' : 'them'} completed first.`,
      );
    }
    // A closed case is locked, so the farm's population must already reflect its deaths and culling.
    const pending = pendingPopulation(c, culledHeads(c.responses));
    if (pending > 0) {
      throw badRequest(
        `${pending} animal(s) that died or were culled are not yet reflected in the farm's population. Use "Update population" (or "Already counted") on the case first.`,
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.diseaseCase.update({
        where: { id },
        data: {
          closedAt: new Date(),
          closedBy: req.user?.name ?? null,
          closureNote: d.note,
          closureOutcome: d.outcome,
        },
      });
      await tx.caseStatusHistory.create({
        data: {
          caseId: id,
          status: c.status,
          note: `Case closed — ${CASE_OUTCOME_LABELS[d.outcome]}. ${d.note}`.slice(0, 500),
          byName: req.user?.name,
        },
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
        data: { closedAt: null, closedBy: null, closureNote: null, closureOutcome: null },
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

/** Edit the details that change while an outbreak develops; every change is written to History. */
casesRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(caseUpdateSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({
      where: { id },
      include: { farm: true, assignedTo: true },
    });
    if (!c) throw notFound('Case');
    if (c.closedAt) throw closedError();
    assertNotFuture({ symptomsDate: d.symptomsDate });
    if (d.symptomsDate && d.symptomsDate > ymd(c.reportedAt)!)
      throw badRequest('Validation failed', {
        fieldErrors: { symptomsDate: ['Symptoms cannot be observed after the report date'] },
      });
    if (d.affected !== c.affected)
      await checkAffected(c.farmId, c.farm.name, c.species, d.affected, c.populationReconciled);
    const assignee = d.assignedToId ? await prisma.user.findUnique({ where: { id: d.assignedToId } }) : null;
    const changes: string[] = [];
    const diff = (label: string, a: unknown, b: unknown) => {
      if ((a ?? '') !== (b ?? '')) changes.push(`${label}: ${a ?? '—'} → ${b ?? '—'}`);
    };
    diff('disease', c.disease, d.disease);
    diff('affected', c.affected, d.affected);
    diff('deaths', c.deaths, d.deaths);
    diff('zone', c.zone, d.zone ?? null);
    diff('symptoms observed', fmtDate(ymd(c.symptomsDate)), fmtDate(d.symptomsDate ?? null));
    diff('inspector', c.assignedTo?.name ?? null, assignee?.name ?? null);
    if ((c.symptoms ?? '') !== (d.symptoms ?? '')) changes.push('symptoms updated');
    if ((c.sampleInfo ?? '') !== (d.sampleInfo ?? '')) changes.push('sample info updated');
    if ((c.remarks ?? '') !== (d.remarks ?? '')) changes.push('remarks updated');
    if ((c.reportedBy ?? '') !== (d.reportedBy ?? '')) changes.push('reported by updated');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.diseaseCase.update({
        where: { id },
        data: {
          disease: d.disease,
          zone: d.zone ?? null,
          affected: d.affected,
          deaths: d.deaths,
          symptomsDate: dateOnly(d.symptomsDate) ?? null,
          symptoms: d.symptoms ?? null,
          reportedBy: d.reportedBy ?? null,
          assignedToId: d.assignedToId ?? null,
          sampleInfo: d.sampleInfo ?? null,
          remarks: d.remarks ?? null,
        },
      });
      if (changes.length) {
        await tx.caseStatusHistory.create({
          data: {
            caseId: id,
            status: c.status,
            note: `Details updated — ${changes.join('; ')}`.slice(0, 500),
            byName: req.user?.name,
          },
        });
        await logActivity('case', id, 'updated', `${c.code} details updated`, req.user?.name, tx);
      }
      return u;
    });
    res.json(updated);
  }),
);

/** Mark the case's deaths/culled heads as reflected in the farm population (after an update, or if already counted). */
casesRouter.post(
  '/:id/population-reconciled',
  ah(async (req, res) => {
    const id = idParam(req);
    const c = await prisma.diseaseCase.findUnique({ where: { id }, include: { responses: true } });
    if (!c) throw notFound('Case');
    const culled = culledHeads(c.responses);
    const u = await prisma.diseaseCase.update({
      where: { id },
      data: { populationReconciled: c.deaths + culled },
    });
    await logActivity(
      'case',
      id,
      'population',
      `${c.code}: population reviewed for ${c.deaths} death(s) and ${culled} culled`,
      req.user?.name,
    );
    res.json(u);
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

/**
 * A final case status (Positive/Negative) rests on a matching laboratory result. Editing or voiding
 * that result would leave the status unsupported, so the status has to be corrected first.
 */
async function guardFinalResult(caseId: number, status: CaseStatus, labId: number, newResult: string | null) {
  if (status !== 'POSITIVE' && status !== 'NEGATIVE') return;
  const others = await prisma.labRecord.count({
    where: { caseId, voidedAt: null, result: status, NOT: { id: labId } },
  });
  if (!others && newResult !== status)
    throw badRequest(
      `This case is ${status.toLowerCase()} because of this laboratory result. An administrator must correct the case status first (Update Status → correction).`,
    );
}

/** Update a laboratory record — typically when the result comes back. Changes are written to the case history. */
labsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(labCreateSchema, req.body);
    assertNotFuture({ collectedAt: d.collectedAt, sentAt: d.sentAt, resultDate: d.resultDate });
    const l = await prisma.labRecord.findUnique({ where: { id }, include: { case: true } });
    if (!l || l.voidedAt) throw notFound('Laboratory record');
    if (l.case.closedAt) throw closedError();
    notBeforeCase(l.case, { collectedAt: d.collectedAt, sentAt: d.sentAt, resultDate: d.resultDate });
    await guardFinalResult(l.caseId, l.case.status, id, d.result);
    await assertUniqueSample(d.sampleId, id);
    const next = labData(d);
    const changes: string[] = [];
    const show = (v: unknown) =>
      v instanceof Date ? fmtDate(ymd(v)) : v == null || v === '' ? '—' : String(v);
    const labels: Record<string, string> = {
      sampleId: 'sample ID',
      sampleType: 'type',
      sampleCount: 'samples',
      testMethod: 'test',
      collectedAt: 'collected',
      laboratory: 'laboratory',
      labReference: 'lab ref.',
      submittedBy: 'submitted by',
      sentAt: 'sent',
      result: 'result',
      resultDate: 'result date',
      remarks: 'remarks',
    };
    for (const [k, label] of Object.entries(labels)) {
      const a = show((l as any)[k]);
      const b = show((next as any)[k]);
      if (a !== b)
        changes.push(k === 'result' ? `result ${titleCase(a)} → ${titleCase(b)}` : `${label} ${a} → ${b}`);
    }
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.labRecord.update({
        where: { id },
        data: { ...next, updatedAt: new Date(), updatedBy: req.user?.name ?? null },
      });
      if (changes.length) {
        await historyNote(
          tx,
          l.case,
          `Lab record ${updated.sampleId} updated — ${changes.join('; ')}`,
          req.user?.name,
        );
        await logActivity(
          'case',
          l.caseId,
          'lab',
          `Lab record ${updated.sampleId} updated (${updated.result.toLowerCase()})`,
          req.user?.name,
          tx,
        );
      }
      return updated;
    });
    res.json(u);
  }),
);

/** Whole days from a date column to today (negative when the date is still ahead). */
const daysSince = (d: Date) => Math.round((Date.parse(today()) - Date.parse(ymd(d)!)) / 86400_000);

/**
 * The surveillance work across all open cases, for the Investigation & Lab and Response Activities
 * pages: laboratory samples still awaiting a result, field visits that are due (including cases not
 * visited yet), and response measures in force, ongoing or planned.
 */
recordsRouter.get(
  '/case-worklist',
  ah(async (_req, res) => {
    const open = { closedAt: null };
    const caseInfo = (c: {
      id: number;
      code: string;
      disease: string;
      barangay: string;
      farm: { name: string };
    }) => ({
      caseId: c.id,
      caseCode: c.code,
      disease: c.disease,
      barangay: c.barangay,
      farmName: c.farm.name,
    });
    const labs = await prisma.labRecord.findMany({
      where: { voidedAt: null, result: 'PENDING', case: open },
      include: { case: { include: { farm: true } } },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    });
    const cases = await prisma.diseaseCase.findMany({
      where: open,
      include: {
        farm: true,
        investigations: { where: { voidedAt: null }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 1 },
      },
      orderBy: { reportedAt: 'asc' },
    });
    const visits = cases
      .map((c) => {
        const last = c.investigations[0];
        // Not visited yet: the initial visit is due from the day the case was reported.
        if (!last) return { ...caseInfo(c), kind: 'INITIAL', due: ymd(c.reportedAt)!, lastVisit: null };
        if (!last.nextVisit) return null;
        return { ...caseInfo(c), kind: 'FOLLOW_UP', due: ymd(last.nextVisit)!, lastVisit: ymd(last.date) };
      })
      .filter((v) => v !== null)
      .map((v) => ({ ...v, overdue: v.due < today() }))
      .sort((a, b) => a.due.localeCompare(b.due));
    const responses = await prisma.responseActivity.findMany({
      where: { voidedAt: null, case: open },
      include: { case: { include: { farm: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const t = today();
    const measures = responses
      .map((r) => {
        const withEnd = RESPONSE_TYPES_WITH_END.includes(r.type as ResponseType);
        const started = ymd(r.date)! <= t;
        const lifted = r.endDate != null && ymd(r.endDate)! <= t;
        // Quarantine, movement restriction and checkpoints stay in force until their end date.
        const state =
          r.status === 'PLANNED'
            ? 'PLANNED'
            : withEnd && started && !lifted
              ? 'IN_FORCE'
              : r.status === 'ONGOING'
                ? 'ONGOING'
                : null;
        if (!state) return null;
        return {
          id: r.id,
          ...caseInfo(r.case),
          type: r.type,
          typeLabel: RESPONSE_TYPE_LABELS[r.type as ResponseType] ?? r.type,
          state,
          status: r.status,
          date: ymd(r.date),
          endDate: ymd(r.endDate),
          location: r.location,
          personnel: r.personnel,
          // A planned measure whose date has passed, or one that should have ended, needs an update.
          late: (r.status === 'PLANNED' && started) || (r.status === 'ONGOING' && lifted),
        };
      })
      .filter((m) => m !== null);
    res.json({
      labs: labs.map((l) => ({
        id: l.id,
        ...caseInfo(l.case),
        sampleId: l.sampleId,
        sampleType: l.sampleType,
        testMethod: l.testMethod,
        laboratory: l.laboratory,
        collectedAt: ymd(l.collectedAt),
        sentAt: ymd(l.sentAt),
        // Days since the sample was sent (or collected, if not sent yet).
        waitingDays: l.sentAt ? daysSince(l.sentAt) : l.collectedAt ? daysSince(l.collectedAt) : null,
        sent: l.sentAt != null,
      })),
      visits,
      measures,
    });
  }),
);

/** Update a response activity (e.g. a planned quarantine that started, or was lifted). */
recordsRouter.patch(
  '/responses/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(responseCreateSchema, req.body);
    const r = await prisma.responseActivity.findUnique({ where: { id }, include: { case: true } });
    if (!r || r.voidedAt) throw notFound('Response activity');
    if (r.case.closedAt) throw closedError();
    // Heads of a planned cull were never taken off the population, so they are not given back.
    await checkResponse(r.case, d, r.status === 'PLANNED' ? 0 : (r.heads ?? 0));
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.responseActivity.update({ where: { id }, data: responseData(d) });
      const bits = [
        r.status !== d.status
          ? `${RESPONSE_STATUS_LABELS[r.status as keyof typeof RESPONSE_STATUS_LABELS] ?? r.status} → ${RESPONSE_STATUS_LABELS[d.status]}`
          : null,
        (r.heads ?? 0) !== (updated.heads ?? 0) ? `culled ${r.heads ?? 0} → ${updated.heads ?? 0}` : null,
        ymd(r.endDate) !== ymd(updated.endDate) ? `ends ${fmtDate(ymd(updated.endDate))}` : null,
      ].filter(Boolean);
      await historyNote(
        tx,
        r.case,
        `${RESPONSE_TYPE_LABELS[d.type]} updated${bits.length ? ` — ${bits.join('; ')}` : ''}`,
        req.user?.name,
      );
      await logActivity(
        'case',
        r.caseId,
        'response',
        `${RESPONSE_TYPE_LABELS[d.type]} updated for ${r.case.code}`,
        req.user?.name,
        tx,
      );
      return updated;
    });
    res.json(u);
  }),
);

/**
 * Void a wrong record (admin only). It stays visible, struck through with the reason,
 * and is left out of every figure, reminder and report. Records of a closed case are locked:
 * reopen the case first.
 */
for (const [path, label] of [
  ['labs', 'Laboratory record'],
  ['investigations', 'Investigation'],
  ['responses', 'Response activity'],
  ['vaccinations', 'Vaccination'],
] as const) {
  recordsRouter.post(
    `/${path}/:id/void`,
    requireRole('ADMIN'),
    ah(async (req, res) => {
      const id = idParam(req);
      const { reason } = parse(voidSchema, req.body);
      const data = { voidedAt: new Date(), voidedBy: req.user?.name ?? null, voidReason: reason };
      let entity: 'case' | 'farm' = 'case';
      let entityId: number;
      let what: string;
      let caseRef: { id: number; status: CaseStatus } | null = null;
      if (path === 'labs') {
        const r = await prisma.labRecord.findUnique({ where: { id }, include: { case: true } });
        if (!r || r.voidedAt) throw notFound(label);
        if (r.case.closedAt) throw closedError();
        await guardFinalResult(r.caseId, r.case.status, id, null);
        await prisma.labRecord.update({ where: { id }, data });
        entityId = r.caseId;
        caseRef = r.case;
        what = `lab record ${r.sampleId}`;
      } else if (path === 'investigations') {
        const r = await prisma.investigation.findUnique({ where: { id }, include: { case: true } });
        if (!r || r.voidedAt) throw notFound(label);
        if (r.case.closedAt) throw closedError();
        await prisma.investigation.update({ where: { id }, data });
        entityId = r.caseId;
        caseRef = r.case;
        what = `investigation of ${fmtDate(ymd(r.date))}`;
      } else if (path === 'responses') {
        const r = await prisma.responseActivity.findUnique({ where: { id }, include: { case: true } });
        if (!r || r.voidedAt) throw notFound(label);
        if (r.case.closedAt) throw closedError();
        await prisma.responseActivity.update({ where: { id }, data });
        entityId = r.caseId;
        caseRef = r.case;
        what = `${RESPONSE_TYPE_LABELS[r.type as ResponseType] ?? r.type} of ${fmtDate(ymd(r.date))}`;
      } else {
        const r = await prisma.vaccination.findUnique({ where: { id } });
        if (!r || r.voidedAt) throw notFound(label);
        // Voiding a dose brings back any reminder it had marked as fulfilled.
        await prisma.$transaction(async (tx) => {
          await tx.vaccination.update({ where: { id }, data });
          await refreshReminders(tx, r);
        });
        entity = 'farm';
        entityId = r.farmId;
        what = `vaccination ${r.code}`;
      }
      if (caseRef) await historyNote(prisma, caseRef, `Voided ${what}: ${reason}`, req.user?.name);
      await logActivity(entity, entityId, 'voided', `Voided ${what}: ${reason}`, req.user?.name);
      res.json({ ok: true });
    }),
  );
}

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