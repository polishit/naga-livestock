import { Router } from 'express';
import {
  LAB_PURPOSE_LABELS,
  RESULT_RECEIVED_LABELS,
  labResultsSchema,
  labSubmissionSchema,
  voidSchema,
  type LabPurpose,
  type LabSampleInput,
} from '@livestock/shared';
import { prisma, type Prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { assertNotFuture, dateOnly, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse } from '../lib/http';
import { assertUniqueSample, serializeLab, syncCaseStatus } from './cases';

/**
 * Laboratory submissions: one batch of samples sent to the laboratory (RADDL), as on the Analysis
 * Request Form and the Laboratory Sample Collection Form. Routine surveillance samples belong to no
 * disease case; a positive one is turned into a case from its row.
 */
export const labSubmissionsRouter = Router();

const sampleInclude = {
  farm: { include: { owner: true } },
  case: true,
} as const;

function serializeSample(l: Prisma.LabRecordGetPayload<{ include: typeof sampleInclude }>) {
  return {
    ...serializeLab(l),
    farmName: l.farm?.name ?? null,
    farmCode: l.farm?.code ?? null,
    ownerId: l.farm?.ownerId ?? null,
    ownerName: l.farm?.owner.fullName ?? null,
    barangay: l.farm?.barangay ?? null,
    lat: l.farm?.lat ?? null,
    lng: l.farm?.lng ?? null,
  };
}

function serializeSubmission(
  s: Prisma.LabSubmissionGetPayload<{ include: { samples: { include: typeof sampleInclude } } }>,
) {
  const samples = s.samples.filter((x) => !x.voidedAt);
  const count = (r: string) => samples.filter((x) => x.result === r).length;
  const barangays = [...new Set(samples.map((x) => x.farm?.barangay).filter(Boolean))] as string[];
  const species = [...new Set(samples.map((x) => x.species).filter(Boolean))] as string[];
  const dates = samples
    .map((x) => ymd(x.collectedAt))
    .filter(Boolean)
    .sort() as string[];
  return {
    id: s.id,
    code: s.code,
    purpose: s.purpose,
    purposeLabel: LAB_PURPOSE_LABELS[s.purpose as LabPurpose] ?? s.purpose,
    examination: s.examination,
    laboratory: s.laboratory,
    submittedAt: ymd(s.submittedAt),
    submittedBy: s.submittedBy,
    notedBy: s.notedBy,
    requestId: s.requestId,
    accessionNo: s.accessionNo,
    remarks: s.remarks,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    collectedFrom: dates[0] ?? null,
    collectedTo: dates[dates.length - 1] ?? null,
    barangays,
    species,
    total: samples.length,
    pending: count('PENDING'),
    positive: count('POSITIVE'),
    negative: count('NEGATIVE'),
    inconclusive: count('INCONCLUSIVE'),
    // Positive samples not turned into a disease case yet.
    positiveNoCase: samples.filter((x) => x.result === 'POSITIVE' && !x.caseId).length,
    samples: s.samples.map(serializeSample),
  };
}

const load = (id: number) =>
  prisma.labSubmission.findUnique({
    where: { id },
    include: { samples: { include: sampleInclude, orderBy: { id: 'asc' } } },
  });

/** The farms must exist, be active and raise the species sampled; sample IDs must be new. */
async function checkSamples(samples: LabSampleInput[], submittedAt?: string) {
  const farms = await prisma.farm.findMany({
    where: { id: { in: [...new Set(samples.map((x) => x.farmId))] } },
    include: { groups: { where: { archived: false }, select: { species: true } } },
  });
  const errors: Record<string, string[]> = {};
  for (const [i, x] of samples.entries()) {
    const f = farms.find((y) => y.id === x.farmId);
    if (!f || f.archived) errors[`samples.${i}.farmId`] = ['Select an active farm'];
    else if (!f.groups.some((g) => g.species === x.species))
      errors[`samples.${i}.species`] = [`${f.name} has no ${x.species.toLowerCase()} on record`];
    if (submittedAt && x.collectedAt > submittedAt)
      errors[`samples.${i}.collectedAt`] = ['Collected after the date submitted'];
    try {
      assertNotFuture({ collectedAt: x.collectedAt });
    } catch {
      errors[`samples.${i}.collectedAt`] = ['Cannot be a future date'];
    }
    try {
      await assertUniqueSample(x.sampleId, x.id);
    } catch (e: any) {
      errors[`samples.${i}.sampleId`] = e?.details?.fieldErrors?.sampleId ?? ['Sample ID already used'];
    }
  }
  if (Object.keys(errors).length) throw badRequest('Validation failed', { fieldErrors: errors });
}

/** The batch details copied onto each of its samples. */
function headerOnSample(d: ReturnType<typeof labSubmissionSchema.parse>) {
  return {
    testMethod: d.examination.slice(0, 80),
    laboratory: d.laboratory,
    submittedBy: d.submittedBy ?? null,
    sentAt: dateOnly(d.submittedAt) ?? null,
    labReference: d.accessionNo ?? null,
  };
}
function sampleData(x: LabSampleInput) {
  return {
    farmId: x.farmId,
    species: x.species,
    sampleId: x.sampleId,
    sampleType: x.sampleType,
    animalAge: x.animalAge ?? null,
    animalSex: x.animalSex ?? null,
    condition: x.condition ?? null,
    hoursSinceDeath: x.condition === 'DEAD' ? (x.hoursSinceDeath ?? null) : null,
    organs: x.sampleType === 'Tissue / Organs' ? (x.organs ?? null) : null,
    collectedAt: dateOnly(x.collectedAt),
  };
}

labSubmissionsRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.labSubmission.findMany({
      include: { samples: { include: sampleInclude } },
      orderBy: [{ createdAt: 'desc' }],
    });
    res.json(rows.map((r) => ({ ...serializeSubmission(r), samples: undefined })));
  }),
);

/** One sample with its batch (to open a disease case from a positive surveillance sample). */
labSubmissionsRouter.get(
  '/samples/:id',
  ah(async (req, res) => {
    const x = await prisma.labRecord.findUnique({
      where: { id: idParam(req) },
      include: { ...sampleInclude, submission: true },
    });
    if (!x || !x.submission) throw notFound('Sample');
    const { samples: _s, ...submission } = serializeSubmission({ ...x.submission, samples: [] });
    res.json({ sample: serializeSample(x), submission });
  }),
);

labSubmissionsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const s = await load(idParam(req));
    if (!s) throw notFound('Laboratory submission');
    res.json(serializeSubmission(s));
  }),
);

labSubmissionsRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(labSubmissionSchema, req.body);
    assertNotFuture({ submittedAt: d.submittedAt });
    await checkSamples(d.samples, d.submittedAt);
    const created = await prisma.$transaction(async (tx) => {
      const s = await tx.labSubmission.create({
        data: {
          code: tempCode(),
          purpose: d.purpose,
          examination: d.examination,
          laboratory: d.laboratory,
          submittedAt: dateOnly(d.submittedAt) ?? null,
          submittedBy: d.submittedBy ?? null,
          notedBy: d.notedBy ?? null,
          requestId: d.requestId ?? null,
          accessionNo: d.accessionNo ?? null,
          remarks: d.remarks ?? null,
          createdBy: req.user?.name ?? null,
        },
      });
      const code = displayCode('SUB', s.id);
      await tx.labSubmission.update({ where: { id: s.id }, data: { code } });
      await tx.labRecord.createMany({
        data: d.samples.map((x) => ({ submissionId: s.id, ...sampleData(x), ...headerOnSample(d) })),
      });
      await logActivity(
        'lab-submission',
        s.id,
        'created',
        `${code}: ${d.samples.length} sample(s) for ${d.examination} (${LAB_PURPOSE_LABELS[d.purpose].toLowerCase()})`,
        req.user?.name,
        tx,
      );
      return { id: s.id, code };
    });
    res.status(201).json(created);
  }),
);

/**
 * Edit a batch: its details, and its samples (add, correct, or remove one entered by mistake).
 * A sample that has a result or belongs to a disease case is kept.
 */
labSubmissionsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(labSubmissionSchema, req.body);
    assertNotFuture({ submittedAt: d.submittedAt });
    const before = await load(id);
    if (!before) throw notFound('Laboratory submission');
    const own = new Map(before.samples.map((x) => [x.id, x]));
    for (const x of d.samples)
      if (x.id && !own.has(x.id)) throw badRequest('A sample does not belong to this submission');
    await checkSamples(d.samples, d.submittedAt);
    const keep = new Set(d.samples.map((x) => x.id).filter(Boolean));
    const removed = before.samples.filter((x) => !x.voidedAt && !keep.has(x.id));
    const locked = removed.filter((x) => x.result !== 'PENDING' || x.caseId);
    if (locked.length)
      throw badRequest(
        `${locked.map((x) => x.sampleId).join(', ')} already has a result or a disease case and cannot be removed. Void it instead.`,
      );
    await prisma.$transaction(async (tx) => {
      await tx.labSubmission.update({
        where: { id },
        data: {
          purpose: d.purpose,
          examination: d.examination,
          laboratory: d.laboratory,
          submittedAt: dateOnly(d.submittedAt) ?? null,
          submittedBy: d.submittedBy ?? null,
          notedBy: d.notedBy ?? null,
          requestId: d.requestId ?? null,
          accessionNo: d.accessionNo ?? null,
          remarks: d.remarks ?? null,
        },
      });
      if (removed.length) await tx.labRecord.deleteMany({ where: { id: { in: removed.map((x) => x.id) } } });
      for (const x of d.samples) {
        const data = { ...sampleData(x), ...headerOnSample(d) };
        if (x.id) {
          const old = own.get(x.id)!;
          // A sample on a disease case keeps the case's farm and species.
          await tx.labRecord.update({
            where: { id: x.id },
            data: old.caseId ? { ...data, farmId: old.farmId, species: old.species } : data,
          });
          if (old.caseId) await syncCaseStatus(tx, old.caseId, req.user?.name);
        } else await tx.labRecord.create({ data: { submissionId: id, ...data } });
      }
      await logActivity('lab-submission', id, 'updated', `${before.code} updated`, req.user?.name, tx);
    });
    res.json({ id });
  }),
);

/** Enter the results as they come back (often by email): one result date for the batch. */
labSubmissionsRouter.post(
  '/:id/results',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(labResultsSchema, req.body);
    assertNotFuture({ resultDate: d.resultDate });
    const s = await load(id);
    if (!s) throw notFound('Laboratory submission');
    const byId = new Map(s.samples.map((x) => [x.id, x]));
    const errors: string[] = [];
    for (const r of d.results) {
      const x = byId.get(r.id);
      if (!x || x.voidedAt) errors.push('A sample does not belong to this submission');
      else if (x.case?.closedAt && x.result !== r.result) errors.push(`${x.sampleId} is on a closed case`);
      else if (x.collectedAt && ymd(x.collectedAt)! > d.resultDate)
        errors.push(`${x.sampleId}: the result date is before the collection date`);
      else if (x.sentAt && ymd(x.sentAt)! > d.resultDate)
        errors.push(`${x.sampleId}: the result date is before the date submitted`);
    }
    if (errors.length)
      throw badRequest('Validation failed', {
        fieldErrors: { resultDate: [[...new Set(errors)].join('; ')] },
      });
    let changed = 0;
    await prisma.$transaction(async (tx) => {
      for (const r of d.results) {
        const x = byId.get(r.id)!;
        if (x.result === r.result) continue;
        changed++;
        await tx.labRecord.update({
          where: { id: x.id },
          data: {
            result: r.result,
            resultDate: r.result === 'PENDING' ? null : dateOnly(d.resultDate),
            receivedVia: r.result === 'PENDING' ? null : (d.receivedVia ?? null),
            updatedAt: new Date(),
            updatedBy: req.user?.name ?? null,
          },
        });
        if (x.caseId) await syncCaseStatus(tx, x.caseId, req.user?.name);
      }
      const pos = d.results.filter((r) => r.result === 'POSITIVE').length;
      await logActivity(
        'lab-submission',
        id,
        'results',
        `${s.code}: ${changed} result(s) entered${pos ? ` — ${pos} positive` : ''}${d.receivedVia ? ` (received by ${RESULT_RECEIVED_LABELS[d.receivedVia].toLowerCase()})` : ''}`,
        req.user?.name,
        tx,
      );
    });
    res.json({ changed });
  }),
);

/** Void a sample sent in a batch (entered in error); it stays listed, struck through. */
labSubmissionsRouter.post(
  '/samples/:id/void',
  ah(async (req, res) => {
    const id = idParam(req);
    const { reason } = parse(voidSchema, req.body);
    const x = await prisma.labRecord.findUnique({ where: { id }, include: { case: true, submission: true } });
    if (!x || x.voidedAt || !x.submissionId) throw notFound('Sample');
    if (x.case?.closedAt) throw badRequest('This sample is on a closed case');
    await prisma.$transaction(async (tx) => {
      await tx.labRecord.update({
        where: { id },
        data: { voidedAt: new Date(), voidedBy: req.user?.name ?? null, voidReason: reason },
      });
      if (x.caseId) await syncCaseStatus(tx, x.caseId, req.user?.name);
      await logActivity(
        'lab-submission',
        x.submissionId!,
        'voided',
        `${x.submission?.code}: sample ${x.sampleId} voided — ${reason}`,
        req.user?.name,
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
