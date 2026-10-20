import { Router } from 'express';
import {
  SPECIES_ID_LETTER,
  animalCreateSchema,
  animalUpdateSchema,
  strayCreateSchema,
  strayUpdateSchema,
  transferCreateSchema,
  type Species,
} from '@livestock/shared';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, dateTime, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse, qstr } from '../lib/http';
import { serializeCase, serializeTransfer, serializeVaccination } from './serializers';

export const animalsRouter = Router();
export const transfersRouter = Router();
export const straysRouter = Router();

const animalInclude = { group: { include: { farm: { include: { owner: true } } } } } as const;

function serializeAnimal(a: any) {
  return {
    id: a.id,
    code: a.code,
    earTag: a.earTag,
    species: a.species,
    breed: a.breed,
    sex: a.sex,
    dob: ymd(a.dob),
    estimatedAge: a.estimatedAge,
    lifeStage: a.lifeStage,
    markings: a.markings,
    cowlick: a.cowlick,
    health: a.health,
    photoKeys: (a.photoKeys as string[] | null) ?? [],
    remarks: a.remarks,
    status: a.status,
    groupId: a.groupId,
    groupCode: a.group?.code,
    farmId: a.group?.farm?.id,
    farmName: a.group?.farm?.name,
    ownerId: a.group?.farm?.owner?.id,
    ownerName: a.group?.farm?.owner?.fullName,
    barangay: a.group?.farm?.barangay,
    createdAt: a.createdAt,
  };
}

animalsRouter.get(
  '/',
  ah(async (req, res) => {
    const status = qstr(req.query.status);
    const animals = await prisma.animal.findMany({
      where: status ? { status: status as any } : {},
      include: animalInclude,
      orderBy: { id: 'asc' },
    });
    res.json(animals.map(serializeAnimal));
  }),
);

animalsRouter.get(
  '/lookup',
  ah(async (req, res) => {
    const q = qstr(req.query.q);
    if (!q) throw badRequest('Enter an Animal ID or ear tag');
    const a = await prisma.animal.findFirst({
      where: { OR: [{ code: q.toUpperCase() }, { earTag: q.toUpperCase() }, { earTag: q }] },
      include: animalInclude,
    });
    if (!a) throw notFound(`No animal matches "${q}"`.replace(' not found', ''));
    res.json(serializeAnimal(a));
  }),
);

animalsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const a = await prisma.animal.findUnique({ where: { id }, include: animalInclude });
    if (!a) throw notFound('Animal');
    const vaccinations = await prisma.vaccination.findMany({
      where: { OR: [{ animalId: id }, { groupId: a.groupId }] },
      include: { farm: true, group: true, animal: true },
      orderBy: { date: 'desc' },
    });
    const farmNames = new Map(
      (await prisma.farm.findMany({ select: { id: true, name: true } })).map((f) => [f.id, f.name]),
    );
    const transfers = await prisma.ownershipTransfer.findMany({
      where: { animalId: id },
      include: { animal: true, fromOwner: true, toOwner: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    const cases = await prisma.diseaseCase.findMany({
      where: { farmId: a.group.farmId, species: a.species },
      include: { farm: true, owner: true },
      orderBy: { reportedAt: 'desc' },
    });
    const history = await prisma.activityLog.findMany({
      where: { entity: 'animal', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      animal: serializeAnimal(a),
      vaccinations: vaccinations.map(serializeVaccination),
      transfers: transfers.map((t) => serializeTransfer(t, farmNames)),
      cases: cases.map(serializeCase),
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        summary: h.summary,
        byName: h.byName,
        at: h.createdAt,
      })),
    });
  }),
);

animalsRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(animalCreateSchema, req.body);
    const group = await prisma.populationGroup.findUnique({
      where: { id: d.groupId },
      include: { animals: { where: { status: 'ACTIVE' } }, farm: true },
    });
    if (!group || group.archived)
      throw badRequest('Validation failed', { fieldErrors: { groupId: ['Select an active group'] } });
    if (group.animals.length + 1 > group.count) {
      throw badRequest(
        `Group ${group.code} has ${group.count} head and ${group.animals.length} tagged. Update the population count before tagging another animal.`,
      );
    }
    if (d.earTag) {
      const dup = await prisma.animal.findUnique({ where: { earTag: d.earTag } });
      if (dup)
        throw badRequest('Validation failed', {
          fieldErrors: { earTag: [`Ear tag already used by ${dup.code}`] },
        });
    }
    const letter = SPECIES_ID_LETTER[group.species as Species] ?? 'X';
    const animal = await prisma.$transaction(async (tx) => {
      const created = await tx.animal.create({
        data: {
          code: tempCode(),
          earTag: d.earTag ?? null,
          groupId: group.id,
          species: group.species,
          breed: d.breed ?? group.breed,
          sex: d.sex,
          dob: dateOnly(d.dob) ?? null,
          estimatedAge: d.estimatedAge ?? null,
          lifeStage: d.lifeStage ?? null,
          markings: d.markings ?? null,
          cowlick: d.cowlick ?? null,
          health: d.health ?? null,
          photoKeys: d.photoKeys ?? [],
          remarks: d.remarks ?? null,
        },
      });
      const a = await tx.animal.update({
        where: { id: created.id },
        data: { code: displayCode(`NC-${letter}`, created.id) },
      });
      await logActivity(
        'animal',
        a.id,
        'registered',
        `Registered in ${group.code} at ${group.farm.name}`,
        req.user?.name,
        tx,
      );
      return a;
    });
    res.status(201).json(animal);
  }),
);

animalsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(animalUpdateSchema, req.body);
    if (d.earTag) {
      const dup = await prisma.animal.findFirst({ where: { earTag: d.earTag, NOT: { id } } });
      if (dup)
        throw badRequest('Validation failed', {
          fieldErrors: { earTag: [`Ear tag already used by ${dup.code}`] },
        });
    }
    const before = await prisma.animal.findUnique({ where: { id } });
    if (!before) throw notFound('Animal');
    const a = await prisma.animal.update({
      where: { id },
      data: {
        earTag: d.earTag ?? null,
        breed: d.breed ?? null,
        sex: d.sex,
        dob: d.dob ? dateOnly(d.dob) : null,
        estimatedAge: d.estimatedAge ?? null,
        lifeStage: d.lifeStage ?? null,
        markings: d.markings ?? null,
        cowlick: d.cowlick ?? null,
        health: d.health ?? null,
        photoKeys: d.photoKeys ?? (before.photoKeys as string[] | null) ?? [],
        remarks: d.remarks ?? null,
        ...(d.status ? { status: d.status } : {}),
      },
    });
    const changed =
      d.status && d.status !== before.status
        ? ` (status ${before.status.toLowerCase()} → ${d.status.toLowerCase()})`
        : '';
    await logActivity('animal', id, 'updated', `Record updated${changed}`, req.user?.name);
    res.json(a);
  }),
);

/* ---------------- ownership transfers ---------------- */

transfersRouter.get(
  '/',
  ah(async (_req, res) => {
    const farmNames = new Map(
      (await prisma.farm.findMany({ select: { id: true, name: true } })).map((f) => [f.id, f.name]),
    );
    const rows = await prisma.ownershipTransfer.findMany({
      include: { animal: true, fromOwner: true, toOwner: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    res.json(rows.map((t) => serializeTransfer(t, farmNames)));
  }),
);

transfersRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(transferCreateSchema, req.body);
    const animal = await prisma.animal.findUnique({ where: { id: d.animalId }, include: animalInclude });
    if (!animal) throw notFound('Animal');
    if (animal.status !== 'ACTIVE') throw badRequest('Only active animals can be transferred');
    const toFarm = await prisma.farm.findUnique({ where: { id: d.toFarmId }, include: { owner: true } });
    if (!toFarm || toFarm.archived)
      throw badRequest('Validation failed', { fieldErrors: { toFarmId: ['Select an active farm'] } });
    if (toFarm.id === animal.group.farmId)
      throw badRequest('Validation failed', {
        fieldErrors: { toFarmId: ['Animal is already at this farm'] },
      });

    const t = await prisma.$transaction(async (tx) => {
      let dest = await tx.populationGroup.findFirst({
        where: { farmId: toFarm.id, species: animal.species, archived: false },
        orderBy: { id: 'asc' },
      });
      if (!dest) {
        const created = await tx.populationGroup.create({
          data: {
            code: tempCode(),
            farmId: toFarm.id,
            species: animal.species,
            breed: animal.breed,
            count: 0,
            lastVerified: null,
          },
        });
        dest = await tx.populationGroup.update({
          where: { id: created.id },
          data: { code: displayCode('GRP', created.id) },
        });
      }
      // The animal is counted within its group: move one head between the groups.
      await tx.populationGroup.update({ where: { id: animal.groupId }, data: { count: { decrement: 1 } } });
      await tx.populationGroup.update({ where: { id: dest.id }, data: { count: { increment: 1 } } });
      await tx.animal.update({ where: { id: animal.id }, data: { groupId: dest.id } });
      const created = await tx.ownershipTransfer.create({
        data: {
          code: tempCode(),
          animalId: animal.id,
          fromOwnerId: animal.group.farm.ownerId,
          fromFarmId: animal.group.farmId,
          toOwnerId: toFarm.ownerId,
          toFarmId: toFarm.id,
          date: dateOnly(d.date)!,
          type: d.type,
          remarks: d.remarks ?? null,
          createdBy: req.user?.name,
        },
      });
      const tr = await tx.ownershipTransfer.update({
        where: { id: created.id },
        data: { code: displayCode('TRF', created.id) },
      });
      await logActivity(
        'animal',
        animal.id,
        d.type === 'REVERSAL' ? 'reversal' : 'transfer',
        `${d.type === 'REVERSAL' ? 'Reversal' : 'Transfer'} ${tr.code}: ${animal.group.farm.owner.fullName} → ${toFarm.owner.fullName} (${toFarm.name})`,
        req.user?.name,
        tx,
      );
      return tr;
    });
    res.status(201).json(t);
  }),
);

/* ---------------- stray livestock & violations ---------------- */

function serializeStray(s: any) {
  return {
    id: s.id,
    code: s.code,
    discoveredAt: s.discoveredAt,
    species: s.species,
    earTag: s.earTag,
    animalId: s.animalId,
    ownerId: s.ownerId,
    ownerName: s.owner?.fullName ?? null,
    barangay: s.barangay,
    location: s.location,
    description: s.description,
    lat: s.lat,
    lng: s.lng,
    mapped: s.lat != null && s.lng != null,
    photoKeys: (s.photoKeys as string[] | null) ?? [],
    status: s.status,
    violations: s.violations,
    remarks: s.remarks,
  };
}

straysRouter.get(
  '/',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const status = qstr(req.query.status);
    const rows = await prisma.strayIncident.findMany({
      where: { ...(barangay ? { barangay } : {}), ...(status ? { status: status as any } : {}) },
      include: { owner: true },
      orderBy: { discoveredAt: 'desc' },
    });
    res.json(rows.map(serializeStray));
  }),
);

straysRouter.get(
  '/:id',
  ah(async (req, res) => {
    const s = await prisma.strayIncident.findUnique({
      where: { id: idParam(req) },
      include: { owner: true },
    });
    if (!s) throw notFound('Incident');
    res.json(serializeStray(s));
  }),
);

straysRouter.post(
  '/',
  ah(async (req, res) => {
    const d = parse(strayCreateSchema, req.body);
    let animalId: number | null = null;
    let ownerId = d.ownerId ?? null;
    if (d.earTag) {
      const a = await prisma.animal.findFirst({
        where: { OR: [{ earTag: d.earTag }, { code: d.earTag.toUpperCase() }] },
        include: animalInclude,
      });
      if (a) {
        animalId = a.id;
        ownerId = ownerId ?? a.group.farm.ownerId;
      }
    }
    const s = await prisma.$transaction(async (tx) => {
      const created = await tx.strayIncident.create({
        data: {
          code: tempCode(),
          discoveredAt: dateTime(d.discoveredAt) ?? new Date(),
          species: d.species,
          earTag: d.earTag ?? null,
          animalId,
          ownerId,
          barangay: d.barangay,
          location: d.location,
          description: d.description ?? null,
          lat: d.lat ?? null,
          lng: d.lng ?? null,
          photoKeys: d.photoKeys ?? [],
          createdBy: req.user?.name,
        },
      });
      const st = await tx.strayIncident.update({
        where: { id: created.id },
        data: { code: displayCode('STR', created.id) },
      });
      await logActivity(
        'stray',
        st.id,
        'reported',
        `Stray ${st.species.toLowerCase()} reported in ${st.barangay} (${st.code})`,
        req.user?.name,
        tx,
      );
      if (animalId)
        await logActivity('animal', animalId, 'stray', `Reported stray (${st.code})`, req.user?.name, tx);
      return st;
    });
    res.status(201).json(s);
  }),
);

straysRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(strayUpdateSchema, req.body);
    const s = await prisma.strayIncident.update({
      where: { id },
      data: {
        ...(d.status ? { status: d.status } : {}),
        ...(d.violations !== undefined ? { violations: d.violations } : {}),
        ...(d.ownerId !== undefined ? { ownerId: d.ownerId } : {}),
        ...(d.remarks !== undefined ? { remarks: d.remarks } : {}),
      },
    });
    await logActivity(
      'stray',
      id,
      'updated',
      `Stray ${s.code} updated (${s.status.toLowerCase()}, ${s.violations} violation(s))`,
      req.user?.name,
    );
    res.json(s);
  }),
);