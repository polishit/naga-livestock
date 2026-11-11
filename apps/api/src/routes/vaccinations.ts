import { Router } from 'express';
import {
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  type ServiceType,
  vaccinationCreateSchema,
} from '@livestock/shared';
import { prisma, type Prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { assertNotFuture, dateOnly, today, ymd } from '../lib/dates';
import { ah, badRequest, parse, qstr } from '../lib/http';
import { vaccinationCoverage } from '../services/metrics';
import { getSettings } from '../services/settings';
import { serializeVaccination } from './serializers';

export const vaccinationsRouter = Router();

/** Missed doses stay on the schedule (marked overdue) for this many days after their due date. */
export const OVERDUE_DAYS = 30;

const include = { farm: true, group: true, animal: true } as const;

/**
 * Reminders only for animals still on record: a tagged animal that was sold or died, or a group that
 * was archived, no longer needs its next dose.
 */
export const liveReminder = {
  farm: { archived: false },
  OR: [
    { target: 'GROUP' as const, group: { archived: false } },
    { target: 'ANIMAL' as const, animal: { status: 'ACTIVE' as const } },
  ],
};

/**
 * Recompute which "next dose" reminders are fulfilled for one group or animal and vaccine: a reminder
 * is done when a later dose of the same vaccine was given. Run after a dose is added or voided, so
 * voiding a dose brings back the reminder it had cleared.
 */
export async function refreshReminders(
  tx: Prisma.TransactionClient,
  v: { groupId: number | null; animalId: number | null; vaccine: string | null; serviceType: string },
) {
  // A reminder is for the same service and product (e.g. the next deworming of the same goats).
  const keyOf = (x: { vaccine: string | null; serviceType: string }) =>
    `${x.serviceType}|${(x.vaccine ?? '').trim().toLowerCase()}`;
  const key = keyOf(v);
  const doses = (
    await tx.vaccination.findMany({
      where: { voidedAt: null, ...(v.animalId ? { animalId: v.animalId } : { groupId: v.groupId }) },
      select: { id: true, date: true, nextDate: true, vaccine: true, serviceType: true, reminderDone: true },
    })
  ).filter((x) => keyOf(x) === key);
  for (const x of doses) {
    if (!x.nextDate) continue;
    const done = doses.some(
      (y) =>
        y.id !== x.id &&
        (y.date.getTime() > x.date.getTime() || (y.date.getTime() === x.date.getTime() && y.id > x.id)),
    );
    if (done !== x.reminderDone)
      await tx.vaccination.update({ where: { id: x.id }, data: { reminderDone: done } });
  }
}

vaccinationsRouter.get(
  '/',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const type = qstr(req.query.type);
    const rows = await prisma.vaccination.findMany({
      where: {
        ...(barangay ? { farm: { barangay } } : {}),
        ...(type && (SERVICE_TYPES as readonly string[]).includes(type) ? { serviceType: type } : {}),
      },
      include,
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
    });
    res.json(rows.map(serializeVaccination));
  }),
);

vaccinationsRouter.get(
  '/upcoming',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const settings = await getSettings();
    const days = Number(req.query.days) || settings.vaccinationUpcomingDays;
    const start = today();
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days);
    // Doses that were due recently but not given are listed first, as overdue.
    const missedSince = new Date(new Date(`${start}T00:00:00Z`).getTime() - OVERDUE_DAYS * 86400_000);
    const rows = await prisma.vaccination.findMany({
      where: {
        voidedAt: null,
        reminderDone: false,
        nextDate: { gte: missedSince, lte: end },
        ...liveReminder,
        ...(barangay ? { farm: { archived: false, barangay } } : {}),
      },
      include,
      orderBy: { nextDate: 'asc' },
    });
    res.json({
      days,
      overdueDays: OVERDUE_DAYS,
      rows: rows.map((v) => ({ ...serializeVaccination(v), overdue: ymd(v.nextDate)! < start })),
    });
  }),
);

vaccinationsRouter.get(
  '/coverage',
  ah(async (req, res) => {
    res.json(
      await vaccinationCoverage({
        barangay: qstr(req.query.barangay),
        species: qstr(req.query.species),
        from: qstr(req.query.from),
        to: qstr(req.query.to),
      }),
    );
  }),
);

vaccinationsRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(vaccinationCreateSchema, req.body);
    assertNotFuture({ date: d.date });
    const farm = await prisma.farm.findUnique({ where: { id: d.farmId } });
    if (!farm) throw badRequest('Validation failed', { fieldErrors: { farmId: ['Select a farm'] } });
    if (farm.archived)
      throw badRequest('Validation failed', { fieldErrors: { farmId: ['This farm is archived'] } });
    let species: string;
    let count = d.count;
    if (d.target === 'GROUP') {
      const g = await prisma.populationGroup.findUnique({ where: { id: d.groupId! } });
      if (!g || g.farmId !== farm.id || g.archived)
        throw badRequest('Validation failed', { fieldErrors: { groupId: ['Group is not on this farm'] } });
      if (count > g.count)
        throw badRequest('Validation failed', {
          fieldErrors: { count: [`Group ${g.code} only has ${g.count} head`] },
        });
      species = g.species;
    } else {
      const a = await prisma.animal.findUnique({ where: { id: d.animalId! }, include: { group: true } });
      if (!a || a.group.farmId !== farm.id)
        throw badRequest('Validation failed', { fieldErrors: { groupId: ['Animal is not on this farm'] } });
      if (a.status !== 'ACTIVE')
        throw badRequest('Validation failed', {
          fieldErrors: { animalId: [`${a.code} is ${a.status.toLowerCase()} and cannot be vaccinated`] },
        });
      species = a.species;
      count = 1;
    }
    if (d.nextDate && d.date && d.nextDate <= d.date) {
      throw badRequest('Validation failed', {
        fieldErrors: { nextDate: ['Next schedule must be after the service date'] },
      });
    }
    const v = await prisma.$transaction(async (tx) => {
      const created = await tx.vaccination.create({
        data: {
          code: tempCode(),
          farmId: farm.id,
          target: d.target,
          groupId: d.target === 'GROUP' ? d.groupId! : null,
          animalId: d.target === 'ANIMAL' ? d.animalId! : null,
          species,
          count,
          serviceType: d.serviceType,
          vaccine: d.vaccine ?? null,
          date: dateOnly(d.date ?? today())!,
          nextDate: dateOnly(d.nextDate) ?? null,
          doseNumber: d.doseNumber,
          batch: d.batch ?? null,
          administeredBy: d.administeredBy ?? req.user?.name ?? null,
          remarks: d.remarks ?? null,
        },
      });
      const vv = await tx.vaccination.update({
        where: { id: created.id },
        data: { code: displayCode('SRV', created.id) },
      });
      // This dose fulfils earlier "next dose" reminders for the same group/animal and vaccine
      // (and if it was back-dated before a dose already given, it needs no reminder itself).
      await refreshReminders(tx, vv);
      const what = SERVICE_TYPE_LABELS[vv.serviceType as ServiceType] ?? 'Service';
      await logActivity(
        'farm',
        farm.id,
        'vaccination',
        `${what}${vv.vaccine ? ` (${vv.vaccine})` : ''}: ${count} ${species} at ${farm.name}`,
        req.user?.name,
        tx,
      );
      if (d.target === 'ANIMAL')
        await logActivity(
          'animal',
          d.animalId!,
          'vaccination',
          `${what}${vv.vaccine ? `: ${vv.vaccine}` : ''}${vv.serviceType === 'VACCINATION' ? ` (dose ${vv.doseNumber})` : ''}`,
          req.user?.name,
          tx,
        );
      return vv;
    });
    res.status(201).json(v);
  }),
);
