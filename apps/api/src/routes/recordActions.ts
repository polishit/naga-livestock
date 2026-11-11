/**
 * Removing and correcting records.
 *
 * The rule: records that others depend on are never erased. Registry records are archived (and can be
 * restored); records of things that happened are voided with a reason (kept, struck through, left out of
 * every figure). A record entered by mistake can be deleted for good only while nothing depends on it.
 */
import { Router } from 'express';
import {
  INVESTIGATION_VISIT_LABELS,
  fmtDate,
  investigationCreateSchema,
  vaccinationUpdateSchema,
  voidSchema,
  type CaseStatus,
} from '@livestock/shared';
import { requireRole } from '../auth/auth';
import { prisma } from '../db';
import { logActivity } from '../lib/activity';
import { assertNotFuture, dateOnly, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse } from '../lib/http';
import { refreshReminders } from './vaccinations';

export const recordActionsRouter = Router();

/** Refuse a delete, saying what depends on the record and what to do instead. */
function cannotDelete(what: string, reasons: string[], instead: string) {
  return badRequest(`${what} cannot be deleted: ${reasons.join('; ')}. ${instead}`);
}
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/* ---------------- delete: entered by mistake (admin) ---------------- */

recordActionsRouter.delete(
  '/owners/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const o = await prisma.owner.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            farms: true,
            cases: true,
            strays: true,
            transfersIn: true,
            transfersOut: true,
            pcicPolicies: true,
          },
        },
      },
    });
    if (!o) throw notFound('Owner');
    const c = o._count;
    const reasons = [
      c.farms && `has ${n(c.farms, 'farm')}`,
      c.cases && `has ${n(c.cases, 'disease case')}`,
      c.strays && `has ${n(c.strays, 'stray incident')}`,
      c.transfersIn + c.transfersOut && `has ${n(c.transfersIn + c.transfersOut, 'ownership transfer')}`,
      c.pcicPolicies && `has ${n(c.pcicPolicies, 'PCIC policy', 'PCIC policies')}`,
    ].filter(Boolean) as string[];
    if (reasons.length) throw cannotDelete(`${o.fullName}`, reasons, 'Archive the owner instead.');
    await prisma.owner.delete({ where: { id } });
    await logActivity(
      'owner',
      id,
      'deleted',
      `Owner ${o.code} (${o.fullName}) deleted — entered by mistake`,
      req.user?.name,
    );
    res.json({ ok: true });
  }),
);

recordActionsRouter.delete(
  '/farms/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const f = await prisma.farm.findUnique({
      where: { id },
      include: { _count: { select: { groups: true, cases: true, vaccinations: true, visits: true } } },
    });
    if (!f) throw notFound('Farm');
    const transfers = await prisma.ownershipTransfer.count({
      where: { OR: [{ fromFarmId: id }, { toFarmId: id }] },
    });
    const c = f._count;
    const reasons = [
      c.groups && `has ${n(c.groups, 'animal group')} with head-count history`,
      c.cases && `has ${n(c.cases, 'disease case')}`,
      c.vaccinations && `has ${n(c.vaccinations, 'service record')}`,
      c.visits && `has ${n(c.visits, 'farm visit')}`,
      transfers && `has ${n(transfers, 'ownership transfer')}`,
    ].filter(Boolean) as string[];
    if (reasons.length) throw cannotDelete(f.name, reasons, 'Archive the farm instead.');
    await prisma.farm.delete({ where: { id } });
    await logActivity(
      'farm',
      id,
      'deleted',
      `Farm ${f.code} (${f.name}) deleted — entered by mistake`,
      req.user?.name,
    );
    res.json({ ok: true });
  }),
);

recordActionsRouter.delete(
  '/animals/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const a = await prisma.animal.findUnique({
      where: { id },
      include: { _count: { select: { vaccinations: true, transfers: true, pcicPolicies: true } } },
    });
    if (!a) throw notFound('Animal');
    const strays = await prisma.strayIncident.count({ where: { animalId: id } });
    const c = a._count;
    const reasons = [
      c.vaccinations && `has ${n(c.vaccinations, 'vaccination record')}`,
      c.transfers && `has ${n(c.transfers, 'ownership transfer')}`,
      c.pcicPolicies && 'is insured under a PCIC policy',
      strays && `appears in ${n(strays, 'stray incident')}`,
    ].filter(Boolean) as string[];
    if (reasons.length)
      throw cannotDelete(a.code, reasons, 'Change its status instead (for example Sold or Died).');
    await prisma.animal.delete({ where: { id } });
    await logActivity(
      'animal',
      id,
      'deleted',
      `Animal ${a.code}${a.earTag ? ` (tag ${a.earTag})` : ''} deleted — entered by mistake`,
      req.user?.name,
    );
    res.json({ ok: true });
  }),
);

recordActionsRouter.delete(
  '/strays/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const s = await prisma.strayIncident.findUnique({ where: { id } });
    if (!s) throw notFound('Incident');
    // Once the office acted on it (impounded, fined), the report is part of the record: void it instead.
    const reasons = [
      s.status !== 'REPORTED' && `its status is ${s.status.toLowerCase()}`,
      s.impoundedAt && 'the animal was impounded',
      s.fineAmount != null && Number(s.fineAmount) > 0 && 'a fine was recorded',
      s.voidedAt && 'it is already voided',
    ].filter(Boolean) as string[];
    if (reasons.length) throw cannotDelete(s.code, reasons, 'Void it instead, with the reason.');
    await prisma.strayIncident.delete({ where: { id } });
    await logActivity(
      'stray',
      id,
      'deleted',
      `Stray report ${s.code} deleted — entered by mistake`,
      req.user?.name,
    );
    res.json({ ok: true });
  }),
);

recordActionsRouter.delete(
  '/pcic/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const p = await prisma.pcicPolicy.findUnique({ where: { id } });
    if (!p) throw notFound('Policy');
    if (p.status === 'CLAIMED')
      throw cannotDelete(
        `Policy ${p.policyNo}`,
        ['a claim was made on it'],
        'Keep it as a record of the claim.',
      );
    // The links to insured animals go with it; the animals stay.
    await prisma.pcicPolicy.delete({ where: { id } });
    await logActivity(
      'owner',
      p.ownerId,
      'pcic-deleted',
      `PCIC policy ${p.policyNo} deleted — entered by mistake`,
      req.user?.name,
    );
    res.json({ ok: true });
  }),
);

/* ---------------- void: reported in error or a duplicate (admin) ---------------- */

recordActionsRouter.post(
  '/cases/:id/void',
  requireRole('ADMIN'),
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
  requireRole('ADMIN'),
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
      return updated;
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
