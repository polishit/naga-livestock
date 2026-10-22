import { Router } from 'express';
import {
  farmCreateSchema,
  farmLocationSchema,
  farmReassignSchema,
  farmUpdateSchema,
} from '@livestock/shared';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, today, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse, qstr } from '../lib/http';
import { loadFarms, summarizeFarm } from '../services/metrics';
import { serializeCase, serializeVaccination } from './serializers';

export const farmsRouter = Router();

/** Open cases on this farm that still have no map location. */
const unmappedCaseCount = (farmId: number) =>
  prisma.diseaseCase.count({ where: { farmId, closedAt: null, OR: [{ lat: null }, { lng: null }] } });

farmsRouter.get(
  '/',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const type = qstr(req.query.type);
    const location = qstr(req.query.location);
    let rows = (await loadFarms({ barangay })).map(summarizeFarm);
    if (type) rows = rows.filter((r) => r.type === type);
    if (location === 'mapped') rows = rows.filter((r) => r.mapped);
    if (location === 'unmapped') rows = rows.filter((r) => !r.mapped);
    res.json(rows);
  }),
);

farmsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const farm = await prisma.farm.findUnique({ where: { id }, include: { owner: true } });
    if (!farm) throw notFound('Farm');
    const loaded = (
      await prisma.farm.findMany({
        where: { id },
        include: {
          owner: true,
          groups: {
            where: { archived: false },
            include: {
              updates: { orderBy: [{ month: 'asc' }, { id: 'asc' }] },
              animals: { where: { status: 'ACTIVE' }, select: { id: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      })
    )[0];
    const summary = summarizeFarm(loaded);
    const animals = await prisma.animal.findMany({
      where: { group: { farmId: id } },
      include: { group: true },
      orderBy: { id: 'asc' },
    });
    const cases = await prisma.diseaseCase.findMany({
      where: { farmId: id },
      include: { farm: true, owner: true },
      orderBy: { reportedAt: 'desc' },
    });
    const vaccinations = await prisma.vaccination.findMany({
      where: { farmId: id },
      include: { farm: true, group: true, animal: true },
      orderBy: { date: 'desc' },
    });
    const updates = await prisma.populationUpdate.findMany({
      where: { group: { farmId: id } },
      include: { group: true },
      orderBy: [{ month: 'desc' }, { id: 'desc' }],
    });
    res.json({
      farm: {
        ...summary,
        pastureArea: farm.pastureArea,
        remarks: farm.remarks,
        archived: farm.archived,
        createdAt: farm.createdAt,
        owner: {
          id: farm.owner.id,
          code: farm.owner.code,
          fullName: farm.owner.fullName,
          contact: farm.owner.contact,
        },
      },
      groups: loaded.groups.map((g) => ({
        id: g.id,
        code: g.code,
        species: g.species,
        breed: g.breed,
        sex: g.sex,
        lifeStage: g.lifeStage,
        count: g.count,
        tagged: g.animals.length,
        healthStatus: g.healthStatus,
        lastVerified: g.lastVerified,
      })),
      animals: animals.map((a) => ({
        id: a.id,
        code: a.code,
        earTag: a.earTag,
        species: a.species,
        sex: a.sex,
        status: a.status,
        groupCode: a.group.code,
      })),
      cases: cases.map(serializeCase),
      vaccinations: vaccinations.map(serializeVaccination),
      updates: updates.map((u) => ({
        id: u.id,
        month: u.month,
        groupCode: u.group.code,
        species: u.group.species,
        count: u.count,
        previous: u.previous,
        change: u.change,
        reason: u.reason,
        kind: u.kind,
        superseded: u.superseded,
        createdBy: u.createdBy,
        createdAt: u.createdAt,
      })),
    });
  }),
);

farmsRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(farmCreateSchema, req.body);
    const owner = await prisma.owner.findUnique({ where: { id: d.ownerId } });
    if (!owner || owner.status === 'ARCHIVED')
      throw badRequest('Validation failed', { fieldErrors: { ownerId: ['Select an active owner'] } });
    if ((d.lat == null) !== (d.lng == null))
      throw badRequest('Validation failed', {
        fieldErrors: { lng: ['Provide both latitude and longitude'] },
      });
    const farm = await prisma.$transaction(async (tx) => {
      const created = await tx.farm.create({
        data: {
          code: tempCode(),
          ownerId: d.ownerId,
          name: d.name,
          type: d.type,
          barangay: d.barangay,
          zone: d.zone ?? null,
          address: d.address ?? null,
          pastureArea: d.pastureArea ?? null,
          lat: d.lat ?? null,
          lng: d.lng ?? null,
          remarks: d.remarks ?? null,
        },
      });
      const f = await tx.farm.update({
        where: { id: created.id },
        data: { code: displayCode('FRM', created.id) },
      });
      await logActivity('farm', f.id, 'created', `Farm ${f.code} registered (${f.name})`, req.user?.name, tx);
      return f;
    });
    res.status(201).json(farm);
  }),
);

farmsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(farmUpdateSchema, req.body);
    if ((d.lat == null) !== (d.lng == null)) {
      throw badRequest('Validation failed', { fieldErrors: { lng: ['Provide both latitude and longitude'] } });
    }
    const f = await prisma.farm.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.type !== undefined ? { type: d.type } : {}),
        ...(d.barangay !== undefined ? { barangay: d.barangay } : {}),
        zone: d.zone ?? null,
        address: d.address ?? null,
        pastureArea: d.pastureArea ?? null,
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        remarks: d.remarks ?? null,
      },
    });
    await logActivity('farm', id, 'updated', `Farm ${f.code} updated`, req.user?.name);
    res.json({ ...f, unmappedCases: f.lat != null ? await unmappedCaseCount(id) : 0 });
  }),
);

farmsRouter.patch(
  '/:id/location',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(farmLocationSchema, req.body);
    const f = await prisma.farm.update({ where: { id }, data: { lat: d.lat, lng: d.lng } });
    await logActivity(
      'farm',
      id,
      'geotagged',
      d.lat == null
        ? `Farm ${f.code} location cleared`
        : `Farm ${f.code} geotagged at ${d.lat.toFixed(6)}, ${d.lng!.toFixed(6)}`,
      req.user?.name,
    );
    res.json({ ...f, unmappedCases: f.lat != null ? await unmappedCaseCount(id) : 0 });
  }),
);

farmsRouter.post(
  '/:id/reassign',
  ah(async (req, res) => {
    const id = idParam(req);
    const { ownerId } = parse(farmReassignSchema, req.body);
    const farm = await prisma.farm.findUnique({ where: { id } });
    if (!farm) throw notFound('Farm');
    if (farm.ownerId === ownerId) throw badRequest('Farm already belongs to that owner');
    const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
    if (!owner || owner.status === 'ARCHIVED') throw badRequest('Select an active owner');
    const animals = await prisma.animal.findMany({
      where: { status: 'ACTIVE', group: { farmId: id } },
      select: { id: true, code: true },
    });
    const f = await prisma.$transaction(async (tx) => {
      const updated = await tx.farm.update({ where: { id }, data: { ownerId } });
      // The tagged animals change owner with the farm: give each one an ownership record.
      for (const a of animals) {
        const created = await tx.ownershipTransfer.create({
          data: {
            code: tempCode(),
            animalId: a.id,
            fromOwnerId: farm.ownerId,
            fromFarmId: id,
            toOwnerId: ownerId,
            toFarmId: id,
            date: dateOnly(today())!,
            type: 'TRANSFER',
            remarks: `Farm ${farm.code} reassigned to ${owner.fullName}`,
            createdBy: req.user?.name,
          },
        });
        const tr = await tx.ownershipTransfer.update({
          where: { id: created.id },
          data: { code: displayCode('TRF', created.id) },
        });
        await logActivity(
          'animal',
          a.id,
          'transfer',
          `${tr.code}: owner changed to ${owner.fullName} (farm ${farm.code} reassigned)`,
          req.user?.name,
          tx,
        );
      }
      await logActivity(
        'farm',
        id,
        'reassigned',
        `Farm ${updated.code} reassigned to ${owner.fullName}${animals.length ? ` (${animals.length} tagged animal(s) transferred)` : ''}`,
        req.user?.name,
        tx,
      );
      return updated;
    });
    res.json({ ...f, transferredAnimals: animals.length });
  }),
);

farmsRouter.post(
  '/:id/archive',
  ah(async (req, res) => {
    const id = idParam(req);
    const groups = await prisma.populationGroup.findMany({
      where: { farmId: id, archived: false },
      include: { animals: { where: { status: 'ACTIVE' } } },
    });
    const blockers: string[] = [];
    if (groups.some((g) => g.count > 0)) blockers.push('Farm has population groups with animals');
    if (groups.some((g) => g.animals.length > 0)) blockers.push('Farm has active tagged animals');
    const openCases = await prisma.diseaseCase.count({ where: { farmId: id, closedAt: null } });
    if (openCases) blockers.push(`Farm has ${openCases} open disease case(s) — close them first`);
    if (blockers.length) throw badRequest(`Cannot archive farm: ${blockers.join('; ')}.`);
    const f = await prisma.$transaction(async (tx) => {
      await tx.populationGroup.updateMany({ where: { farmId: id }, data: { archived: true } });
      return tx.farm.update({ where: { id }, data: { archived: true } });
    });
    await logActivity('farm', id, 'archived', `Farm ${f.code} archived`, req.user?.name);
    res.json({ ...f, createdAt: ymd(f.createdAt) });
  }),
);

/** Give the farm's open, unmapped cases the farm's coordinates. */
farmsRouter.post(
  '/:id/locate-cases',
  ah(async (req, res) => {
    const id = idParam(req);
    const farm = await prisma.farm.findUnique({ where: { id } });
    if (!farm) throw notFound('Farm');
    if (farm.lat == null || farm.lng == null) throw badRequest('This farm has no location yet');
    const r = await prisma.diseaseCase.updateMany({
      where: { farmId: id, closedAt: null, OR: [{ lat: null }, { lng: null }] },
      data: { lat: farm.lat, lng: farm.lng, locationSource: 'Farm Coordinates' },
    });
    if (r.count)
      await logActivity(
        'farm',
        id,
        'geotagged',
        `Farm ${farm.code} location applied to ${r.count} case(s)`,
        req.user?.name,
      );
    res.json({ updated: r.count });
  }),
);