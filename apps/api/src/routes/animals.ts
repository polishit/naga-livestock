import { Router } from 'express';
import {
  SPECIES_ID_LETTER,
  isoMonth,
  animalCreateSchema,
  animalMoveSchema,
  animalUpdateSchema,
  strayCreateSchema,
  strayUpdateSchema,
  transferCreateSchema,
  type Species,
} from '@livestock/shared';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { assertNotFuture, dateOnly, dateTime, ymd } from '../lib/dates';
import { ah, badRequest, idParam, notFound, parse, qstr, sent } from '../lib/http';
import { adjustGroupCount } from './population';
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
    // Its own doses, plus doses given to its current group — only since it arrived, if it was
    // transferred in (a group dose given before it came was not given to this animal).
    const lastIn = await prisma.ownershipTransfer.findFirst({
      // A farm reassignment changes the owner, not the herd, so it does not count as arriving.
      where: { animalId: id, toFarmId: a.group.farmId, NOT: { fromFarmId: a.group.farmId } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    const vaccinations = await prisma.vaccination.findMany({
      where: {
        OR: [{ animalId: id }, { groupId: a.groupId, ...(lastIn ? { date: { gte: lastIn.date } } : {}) }],
      },
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
    assertNotFuture({ dob: d.dob });
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
    assertNotFuture({ dob: d.dob });
    if (d.earTag) {
      const dup = await prisma.animal.findFirst({ where: { earTag: d.earTag, NOT: { id } } });
      if (dup)
        throw badRequest('Validation failed', {
          fieldErrors: { earTag: [`Ear tag already used by ${dup.code}`] },
        });
    }
    const before = await prisma.animal.findUnique({ where: { id }, include: { group: true } });
    if (!before) throw notFound('Animal');
    // A tagged animal is counted inside its group: leaving (sold, deceased…) removes one head,
    // coming back to Active adds it again.
    const wasActive = before.status === 'ACTIVE';
    const nowActive = (d.status ?? before.status) === 'ACTIVE';
    const delta = wasActive === nowActive ? 0 : nowActive ? 1 : -1;
    if (delta === 1 && before.group.archived)
      throw badRequest("This animal's group is archived. Transfer it to an active farm instead.");
    const a = await prisma.$transaction(async (tx) => {
      const updated = await tx.animal.update({
        where: { id },
        // Only the fields sent are changed (a blank field clears it); the rest keep their values.
        data: {
          ...sent(req.body, d, [
            'earTag',
            'breed',
            'estimatedAge',
            'lifeStage',
            'markings',
            'cowlick',
            'health',
            'remarks',
          ] as const),
          ...('dob' in req.body ? { dob: dateOnly(d.dob) ?? null } : {}),
          ...(d.sex ? { sex: d.sex } : {}),
          ...(d.photoKeys ? { photoKeys: d.photoKeys } : {}),
          ...(d.status ? { status: d.status } : {}),
        },
      });
      if (delta !== 0) {
        await adjustGroupCount(
          tx,
          before.groupId,
          delta,
          delta < 0
            ? `${before.code} marked ${d.status!.toLowerCase()}`
            : `${before.code} returned to active`,
          req.user?.name,
        );
      }
      return updated;
    });
    const changed =
      d.status && d.status !== before.status
        ? ` (status ${before.status.toLowerCase()} → ${d.status.toLowerCase()})`
        : '';
    await logActivity('animal', id, 'updated', `Record updated${changed}`, req.user?.name);
    res.json(a);
  }),
);

/**
 * Move a tagged animal to another group on the same farm (e.g. weaned young stock joining the adult
 * group). The animal is counted within its group, so one head moves from the old group to the new one.
 */
animalsRouter.post(
  '/:id/move',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(animalMoveSchema, req.body);
    const animal = await prisma.animal.findUnique({ where: { id }, include: { group: true } });
    if (!animal) throw notFound('Animal');
    if (animal.status !== 'ACTIVE') throw badRequest('Only active animals can be moved');
    const dest = await prisma.populationGroup.findUnique({ where: { id: d.groupId } });
    const fail = (msg: string) => badRequest('Validation failed', { fieldErrors: { groupId: [msg] } });
    if (!dest || dest.archived) throw fail('Select an active group');
    if (dest.id === animal.groupId) throw fail('The animal is already in this group');
    if (dest.farmId !== animal.group.farmId)
      throw fail('Choose a group on the same farm (use Transfer to move it to another farm)');
    if (dest.species !== animal.species) throw fail(`Choose a ${animal.species} group`);
    const why = d.reason ? ` — ${d.reason}` : '';
    const moved = await prisma.$transaction(async (tx) => {
      const a = await tx.animal.update({ where: { id }, data: { groupId: dest.id } });
      await adjustGroupCount(
        tx,
        animal.groupId,
        -1,
        `${animal.code} moved to ${dest.code}${why}`,
        req.user?.name,
      );
      await adjustGroupCount(
        tx,
        dest.id,
        1,
        `${animal.code} moved in from ${animal.group.code}${why}`,
        req.user?.name,
      );
      await logActivity(
        'animal',
        id,
        'moved',
        `Moved from ${animal.group.code} to ${dest.code}${why}`,
        req.user?.name,
        tx,
      );
      return a;
    });
    res.json(moved);
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
    assertNotFuture({ date: d.date });
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
    // A transfer cannot be dated before the animal's birth or its previous transfer.
    const lastTransfer = await prisma.ownershipTransfer.findFirst({
      where: { animalId: animal.id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    const earliest = [ymd(animal.dob), ymd(lastTransfer?.date)].filter(Boolean).sort().at(-1);
    if (earliest && d.date < earliest)
      throw badRequest('Validation failed', {
        fieldErrors: {
          date: [
            lastTransfer && ymd(lastTransfer.date) === earliest
              ? `Cannot be before the previous transfer (${earliest})`
              : `Cannot be before the date of birth (${earliest})`,
          ],
        },
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
            // The system knows this new group's exact size (the animal moving in).
            lastVerified: isoMonth(),
          },
        });
        dest = await tx.populationGroup.update({
          where: { id: created.id },
          data: { code: displayCode('GRP', created.id) },
        });
      }
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
      // The animal is counted within its group: move one head between the groups, with history lines.
      await adjustGroupCount(
        tx,
        animal.groupId,
        -1,
        `${tr.code}: ${animal.code} transferred out to ${toFarm.name}`,
        req.user?.name,
      );
      await adjustGroupCount(
        tx,
        dest.id,
        1,
        `${tr.code}: ${animal.code} transferred in from ${animal.group.farm.name}`,
        req.user?.name,
      );
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

/** An owner's earlier stray incidents, so repeat offenders are noticed (optionally leaving one out). */
straysRouter.get(
  '/owner/:ownerId/summary',
  ah(async (req, res) => {
    const ownerId = idParam(req, 'ownerId');
    const except = Number(req.query.except) || undefined;
    const rows = await prisma.strayIncident.findMany({
      where: { ownerId, ...(except ? { NOT: { id: except } } : {}) },
      orderBy: { discoveredAt: 'desc' },
      select: { id: true, code: true, discoveredAt: true, violations: true, status: true },
    });
    res.json({
      incidents: rows.length,
      violations: rows.reduce((a, r) => a + r.violations, 0),
      open: rows.filter((r) => r.status === 'REPORTED' || r.status === 'IMPOUNDED').length,
      last: rows[0] ? { code: rows[0].code, discoveredAt: rows[0].discoveredAt } : null,
    });
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
    assertNotFuture({ discoveredAt: d.discoveredAt });
    let animalId: number | null = null;
    let ownerId = d.ownerId ?? null;
    if (d.earTag) {
      const a = await prisma.animal.findFirst({
        where: { OR: [{ earTag: d.earTag }, { code: d.earTag.toUpperCase() }] },
        include: animalInclude,
      });
      if (a) {
        // A registered tag identifies the animal: its owner and species must match the report.
        const fieldErrors: Record<string, string[]> = {};
        if (ownerId && ownerId !== a.group.farm.ownerId)
          fieldErrors.ownerId = [
            `Tag ${d.earTag} is ${a.code}, owned by ${a.group.farm.owner.fullName}. Record a transfer first if it changed hands.`,
          ];
        if (d.species !== a.species) fieldErrors.species = [`Tag ${d.earTag} is ${a.code}, a ${a.species}`];
        if (Object.keys(fieldErrors).length) throw badRequest('Validation failed', { fieldErrors });
        animalId = a.id;
        ownerId = a.group.farm.ownerId;
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
        // "Unknown owner" (blank) clears a wrongly assigned owner; blank remarks clear the remarks.
        ...sent(req.body, d, ['ownerId', 'remarks'] as const),
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