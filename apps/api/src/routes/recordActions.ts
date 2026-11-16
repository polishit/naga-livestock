/**
 * Retiring and correcting records.
 *
 * Nothing is ever deleted. Registry records are archived or set inactive (and can be restored);
 * records of things that happened are voided with a reason (kept, struck through, left out of every
 * figure); an animal registered by mistake gets the status Voided. Every change is written to the
 * audit trail with the old and new values.
 */
import { Router } from 'express';
import {
  LARGE_RUMINANT_SERVICES,
  type ServiceType,
  isLargeRuminant,
  INVESTIGATION_VISIT_LABELS,
  fmtDate,
  investigationCreateSchema,
  vaccinationUpdateSchema,
  voidSchema,
  type CaseStatus,
} from '@livestock/shared';
import { requireReviewer } from '../auth/auth';
import { prisma } from '../db';
import { logActivity } from '../lib/activity';
import { assertNotFuture, dateOnly, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse } from '../lib/http';
import { refreshReminders } from './vaccinations';
import { deathsFromVisit } from './cases';

export const recordActionsRouter = Router();

/* ---------------- void: reported in error or a duplicate (reviewers) ---------------- */

recordActionsRouter.post(
  '/cases/:id/void',
  requireReviewer,
  ah(async (req, res) => {
    const id = idParam(req);
    const { reason } = parse(voidSchema, req.body);
    const c = await prisma.diseaseCase.findUnique({ where: { id } });
    if (!c) throw notFound('Case');
    if (c.voidedAt) throw badRequest('This case is already voided');
    const by = req.user?.name ?? null;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // A voided case is also closed: it leaves every list of open work and every figure.
      await tx.diseaseCase.update({
        where: { id },
        data: {
          voidedAt: now,
          voidedBy: by,
          voidReason: reason,
          ...(c.closedAt
            ? {}
            : { closedAt: now, closedBy: by, closureNote: `Voided: ${reason}`, closureOutcome: 'OTHER' }),
        },
      });
      await tx.caseStatusHistory.create({
        data: { caseId: id, status: c.status, note: `Case voided: ${reason}`.slice(0, 500), byName: by },
      });
      await logActivity('case', id, 'voided', `${c.code} voided: ${reason}`, by, tx);
    });
    res.json({ ok: true });
  }),
);

recordActionsRouter.post(
  '/strays/:id/void',
  requireReviewer,
  ah(async (req, res) => {
    const id = idParam(req);
    const { reason } = parse(voidSchema, req.body);
    const s = await prisma.strayIncident.findUnique({ where: { id } });
    if (!s) throw notFound('Incident');
    if (s.voidedAt) throw badRequest('This incident is already voided');
    await prisma.strayIncident.update({
      where: { id },
      data: { voidedAt: new Date(), voidedBy: req.user?.name ?? null, voidReason: reason },
    });
    await logActivity('stray', id, 'voided', `Stray report ${s.code} voided: ${reason}`, req.user?.name);
    res.json({ ok: true });
  }),
);

/* ---------------- restore archived farms and groups ---------------- */

recordActionsRouter.post(
  '/farms/:id/restore',
  ah(async (req, res) => {
    const id = idParam(req);
    const f = await prisma.farm.findUnique({ where: { id }, include: { owner: true } });
    if (!f) throw notFound('Farm');
    if (!f.archived) throw badRequest('This farm is not archived');
    if (f.owner.status === 'ARCHIVED')
      throw badRequest(`The owner ${f.owner.fullName} is archived. Restore the owner first.`);
    await prisma.farm.update({ where: { id }, data: { archived: false } });
    await logActivity('farm', id, 'restored', `Farm ${f.code} restored`, req.user?.name);
    res.json({ ok: true });
  }),
);

recordActionsRouter.post(
  '/population/groups/:id/restore',
  ah(async (req, res) => {
    const id = idParam(req);
    const g = await prisma.populationGroup.findUnique({ where: { id }, include: { farm: true } });
    if (!g) throw notFound('Group');
    if (!g.archived) throw badRequest('This group is not archived');
    if (g.farm.archived) throw badRequest(`${g.farm.name} is archived. Restore the farm first.`);
    await prisma.populationGroup.update({ where: { id }, data: { archived: false } });
    await logActivity('farm', g.farmId, 'group-restored', `Group ${g.code} restored`, req.user?.name);
    res.json({ ok: true });
  }),
);

/* ---------------- edit a site visit or a vaccination (fix a typo) ---------------- */

recordActionsRouter.patch(
  '/investigations/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(investigationCreateSchema, req.body);
    assertNotFuture({ date: d.date });
    const i = await prisma.investigation.findUnique({ where: { id }, include: { case: true } });
    if (!i || i.voidedAt) throw notFound('Investigation');
    const c = i.case;
    if (c.closedAt) throw badRequest('This case is closed. Reopen it first to make changes.');
    const start = ymd(c.symptomsDate ?? c.reportedAt)!;
    if (d.date && d.date < start)
      throw badRequest('Validation failed', {
        fieldErrors: { date: [`Cannot be before the case began (${fmtDate(start)})`] },
      });
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.investigation.update({
        where: { id },
        data: {
          date: dateOnly(d.date) ?? i.date,
          visitType: d.visitType,
          investigator: d.investigator ?? null,
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
      await tx.caseStatusHistory.create({
        data: {
          caseId: c.id,
          status: c.status as CaseStatus,
          note: `${INVESTIGATION_VISIT_LABELS[d.visitType]} of ${fmtDate(ymd(updated.date))} edited`,
          byName: req.user?.name ?? null,
        },
      });
      await logActivity(
        'case',
        c.id,
        'investigation-edited',
        `Investigation edited on ${c.code}`,
        req.user?.name,
        tx,
      );
      const deaths = await deathsFromVisit(tx, c, d.deadCount, req.user?.name);
      return { ...updated, deathsUpdated: deaths };
    });
    res.json(u);
  }),
);

recordActionsRouter.patch(
  '/vaccinations/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(vaccinationUpdateSchema, req.body);
    assertNotFuture({ date: d.date });
    const v = await prisma.vaccination.findUnique({ where: { id }, include: { group: true, farm: true } });
    if (!v || v.voidedAt) throw notFound('Vaccination');
    // Who was vaccinated cannot change here (void and re-enter for that); the details can.
    let count = d.count;
    if (v.target === 'GROUP' && v.group && count > v.group.count)
      throw badRequest('Validation failed', {
        fieldErrors: { count: [`Group ${v.group.code} only has ${v.group.count} head`] },
      });
    if (v.target === 'ANIMAL') count = 1;
    const type = d.serviceType ?? v.serviceType;
    if (LARGE_RUMINANT_SERVICES.includes(type as ServiceType) && !isLargeRuminant(v.species))
      throw badRequest('Validation failed', {
        fieldErrors: {
          serviceType: ['Pregnancy diagnosis and insemination are for cattle and carabao only'],
        },
      });
    if (type === 'PREGNANCY_DIAGNOSIS' && !d.result)
      throw badRequest('Validation failed', { fieldErrors: { result: ['Select the result'] } });
    const date = d.date ?? ymd(v.date)!;
    if (d.nextDate && d.nextDate <= date)
      throw badRequest('Validation failed', {
        fieldErrors: { nextDate: ['Next schedule must be after the service date'] },
      });
    const changes: string[] = [];
    const diff = (label: string, a: unknown, b: unknown) => {
      if ((a ?? '') !== (b ?? '')) changes.push(`${label}: ${a ?? '—'} → ${b ?? '—'}`);
    };
    diff('service', v.serviceType, d.serviceType ?? v.serviceType);
    diff('product', v.vaccine, d.vaccine);
    diff('result', v.result, d.result);
    diff('date', fmtDate(ymd(v.date)), fmtDate(date));
    diff('next dose', fmtDate(ymd(v.nextDate)), fmtDate(d.nextDate ?? null));
    diff('head', v.count, count);
    diff('dose', v.doseNumber, d.doseNumber);
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.vaccination.update({
        where: { id },
        data: {
          serviceType: d.serviceType ?? v.serviceType,
          vaccine: d.vaccine ?? null,
          result: (d.serviceType ?? v.serviceType) === 'PREGNANCY_DIAGNOSIS' ? (d.result ?? null) : null,
          date: dateOnly(date)!,
          nextDate: dateOnly(d.nextDate) ?? null,
          count,
          doseNumber: d.doseNumber,
          batch: d.batch ?? null,
          administeredBy: d.administeredBy ?? null,
          remarks: d.remarks ?? null,
        },
      });
      // A changed date or vaccine changes which reminders are already fulfilled.
      await refreshReminders(tx, v);
      if (updated.vaccine !== v.vaccine || updated.serviceType !== v.serviceType)
        await refreshReminders(tx, updated);
      await logActivity(
        'farm',
        v.farmId,
        'vaccination-edited',
        `Service record ${v.code} edited${changes.length ? ` — ${changes.join('; ')}` : ''}`.slice(0, 500),
        req.user?.name,
        tx,
      );
      return updated;
    });
    res.json(u);
  }),
);
