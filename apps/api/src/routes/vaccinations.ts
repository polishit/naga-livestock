import { Router } from 'express';
import { vaccinationCreateSchema } from '@livestock/shared';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, today } from '../lib/dates';
import { ah, badRequest, parse, qstr } from '../lib/http';
import { vaccinationCoverage } from '../services/metrics';
import { getSettings } from '../services/settings';
import { serializeVaccination } from './serializers';

export const vaccinationsRouter = Router();

const include = { farm: true, group: true, animal: true } as const;

vaccinationsRouter.get(
  '/',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const rows = await prisma.vaccination.findMany({
      where: barangay ? { farm: { barangay } } : {},
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
    const rows = await prisma.vaccination.findMany({
      where: {
        nextDate: { gte: new Date(`${start}T00:00:00Z`), lte: end },
        ...(barangay ? { farm: { barangay } } : {}),
      },
      include,
      orderBy: { nextDate: 'asc' },
    });
    res.json({ days, rows: rows.map(serializeVaccination) });
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
    const farm = await prisma.farm.findUnique({ where: { id: d.farmId } });
    if (!farm) throw badRequest('Validation failed', { fieldErrors: { farmId: ['Select a farm'] } });
    let species: string;
    let count = d.count;
    if (d.target === 'GROUP') {
      const g = await prisma.populationGroup.findUnique({ where: { id: d.groupId! } });
      if (!g || g.farmId !== farm.id)
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
      species = a.species;
      count = 1;
    }
    if (d.nextDate && d.date && d.nextDate <= d.date) {
      throw badRequest('Validation failed', {
        fieldErrors: { nextDate: ['Next schedule must be after the vaccination date'] },
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
          vaccine: d.vaccine,
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
        data: { code: displayCode('VAX', created.id) },
      });
      await logActivity(
        'farm',
        farm.id,
        'vaccination',
        `${vv.vaccine} given to ${count} head at ${farm.name}`,
        req.user?.name,
        tx,
      );
      if (d.target === 'ANIMAL')
        await logActivity(
          'animal',
          d.animalId!,
          'vaccination',
          `Vaccinated: ${vv.vaccine} (dose ${vv.doseNumber})`,
          req.user?.name,
          tx,
        );
      return vv;
    });
    res.status(201).json(v);
  }),
);
