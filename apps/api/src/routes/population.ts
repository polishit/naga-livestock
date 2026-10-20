import { Router } from 'express';
import { groupCreateSchema, isoMonth, populationUpdateSchema } from '@livestock/shared';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { ah, badRequest, parse, qstr } from '../lib/http';
import { loadFarms, populationTotals } from '../services/metrics';

export const populationRouter = Router();

populationRouter.get(
  '/groups',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const species = qstr(req.query.species);
    const farmId = Number(req.query.farmId) || undefined;
    const farms = await loadFarms({ barangay, species });
    const rows = farms
      .filter((f) => !farmId || f.id === farmId)
      .flatMap((f) =>
        f.groups.map((g) => ({
          id: g.id,
          code: g.code,
          farmId: f.id,
          farmCode: f.code,
          farmName: f.name,
          ownerId: f.ownerId,
          ownerName: f.owner.fullName,
          barangay: f.barangay,
          species: g.species,
          breed: g.breed,
          sex: g.sex,
          lifeStage: g.lifeStage,
          count: g.count,
          tagged: g.animals.length,
          healthStatus: g.healthStatus,
          lastVerified: g.lastVerified,
        })),
      )
      .sort((a, b) => a.id - b.id);
    res.json(rows);
  }),
);

populationRouter.get(
  '/totals',
  ah(async (req, res) => {
    const farms = await loadFarms({ barangay: qstr(req.query.barangay), species: qstr(req.query.species) });
    const t = populationTotals(farms);
    res.json({ ...t, bySpecies: t.bySpecies.map((s) => ({ ...s })) });
  }),
);

populationRouter.post(
  '/groups',
  ah(async (req, res) => {
    const d = parse(groupCreateSchema, req.body);
    const farm = await prisma.farm.findUnique({ where: { id: d.farmId } });
    if (!farm || farm.archived) throw badRequest('Select an active farm');
    const month = d.reportingMonth ?? isoMonth();
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.populationGroup.create({
        data: {
          code: tempCode(),
          farmId: d.farmId,
          species: d.species,
          breed: d.breed ?? null,
          sex: d.sex,
          lifeStage: d.lifeStage,
          count: d.count,
          healthStatus: d.healthStatus,
          remarks: d.remarks ?? null,
          lastVerified: month,
        },
      });
      const g = await tx.populationGroup.update({
        where: { id: created.id },
        data: { code: displayCode('GRP', created.id) },
      });
      await tx.populationUpdate.create({
        data: {
          groupId: g.id,
          month,
          count: d.count,
          previous: null,
          change: d.count,
          reason: 'Initial count',
          createdBy: req.user?.name,
        },
      });
      await logActivity(
        'farm',
        farm.id,
        'group-added',
        `Group ${g.code} (${g.species}, ${g.count} head) added to ${farm.name}`,
        req.user?.name,
        tx,
      );
      return g;
    });
    res.status(201).json(group);
  }),
);

/**
 * Monthly population update. Change is measured against the previous month's value; re-saving
 * a month supersedes the earlier entry for that month (it is kept, never added again).
 */
populationRouter.post(
  '/updates',
  ah(async (req, res) => {
    const d = parse(populationUpdateSchema, req.body);
    if (d.month > isoMonth())
      throw badRequest('Validation failed', { fieldErrors: { month: ['Cannot report a future month'] } });
    const groups = await prisma.populationGroup.findMany({
      where: { id: { in: d.entries.map((e) => e.groupId) }, farmId: d.farmId, archived: false },
      include: { updates: true, animals: { where: { status: 'ACTIVE' }, select: { id: true } } },
    });
    if (groups.length !== d.entries.length) throw badRequest('One or more groups do not belong to this farm');
    for (const e of d.entries) {
      const g = groups.find((x) => x.id === e.groupId)!;
      if (e.count < g.animals.length) {
        throw badRequest(
          `${g.code}: count (${e.count}) cannot be lower than its ${g.animals.length} tagged animal(s)`,
        );
      }
    }
    const result = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const e of d.entries) {
        const g = groups.find((x) => x.id === e.groupId)!;
        const active = g.updates
          .filter((u) => !u.superseded)
          .sort((a, b) => (a.month === b.month ? a.id - b.id : a.month < b.month ? -1 : 1));
        const prev = active.filter((u) => u.month < d.month).at(-1);
        const sameMonth = active.filter((u) => u.month === d.month);
        if (sameMonth.length)
          await tx.populationUpdate.updateMany({
            where: { id: { in: sameMonth.map((u) => u.id) } },
            data: { superseded: true },
          });
        const previous = prev?.count ?? null;
        const u = await tx.populationUpdate.create({
          data: {
            groupId: g.id,
            month: d.month,
            count: e.count,
            previous,
            change: e.count - (previous ?? 0),
            reason: e.reason ?? null,
            createdBy: req.user?.name,
          },
        });
        const isLatest = !g.lastVerified || d.month >= g.lastVerified;
        if (isLatest)
          await tx.populationGroup.update({
            where: { id: g.id },
            data: { count: e.count, lastVerified: d.month },
          });
        out.push(u);
      }
      const farm = await tx.farm.findUnique({ where: { id: d.farmId } });
      await logActivity(
        'farm',
        d.farmId,
        'population-update',
        `Population for ${farm?.name} updated for ${d.month}`,
        req.user?.name,
        tx,
      );
      return out;
    });
    res.status(201).json({ saved: result.length });
  }),
);
