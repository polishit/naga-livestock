import { Router } from 'express';
import { ownerCreateSchema, ownerUpdateSchema, pcicCreateSchema } from '@livestock/shared';
import { prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { dateOnly, ymd } from '../lib/dates';
import { HttpError, ah, badRequest, idParam, notFound, parse, qstr } from '../lib/http';
import { loadFarms, summarizeFarm } from '../services/metrics';
import { serializeCase, serializeTransfer, serializeVaccination } from './serializers';

export const ownersRouter = Router();

/**
 * Duplicate protection: an RSBSA number belongs to one person (blocked), and the same name in the
 * same barangay is probably the same person (warning — the user can confirm it is someone else).
 */
async function checkDuplicates(
  d: { fullName: string; barangay: string; rsbsa?: string; confirmDuplicate?: boolean },
  exceptId?: number,
) {
  if (d.rsbsa) {
    const r = await prisma.owner.findFirst({
      where: { rsbsa: d.rsbsa, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (r)
      throw badRequest('Validation failed', {
        fieldErrors: { rsbsa: [`RSBSA number already used by ${r.code} (${r.fullName})`] },
      });
  }
  if (d.confirmDuplicate) return;
  const name = d.fullName.replace(/\s+/g, ' ').trim();
  const same = await prisma.owner.findFirst({
    where: {
      fullName: name,
      barangay: d.barangay,
      status: { not: 'ARCHIVED' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (same)
    throw new HttpError(409, 'Possible duplicate owner', {
      fieldErrors: {
        fullName: [
          `Possible duplicate: ${same.code} ${same.fullName} is already registered in ${same.barangay}.`,
        ],
      },
    });
}

ownersRouter.get(
  '/',
  ah(async (req, res) => {
    const barangay = qstr(req.query.barangay);
    const status = qstr(req.query.status);
    const showArchived = req.query.archived === '1' || req.query.archived === 'true';
    const owners = await prisma.owner.findMany({
      where: {
        ...(barangay ? { barangay } : {}),
        ...(status ? { status: status as any } : showArchived ? {} : { status: { not: 'ARCHIVED' } }),
      },
      orderBy: { id: 'asc' },
      include: {
        farms: {
          where: { archived: false },
          include: { groups: { where: { archived: false }, select: { count: true } } },
        },
      },
    });
    res.json(
      owners.map((o) => ({
        id: o.id,
        code: o.code,
        fullName: o.fullName,
        barangay: o.barangay,
        zone: o.zone,
        contact: o.contact,
        rsbsa: o.rsbsa,
        status: o.status,
        registeredAt: o.registeredAt,
        farms: o.farms.length,
        livestock: o.farms.reduce((a, f) => a + f.groups.reduce((b, g) => b + g.count, 0), 0),
      })),
    );
  }),
);

ownersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const o = await prisma.owner.findUnique({
      where: { id },
      include: { pcicPolicies: { orderBy: { startDate: 'desc' } } },
    });
    if (!o) throw notFound('Owner');
    const farms = (
      await prisma.farm.findMany({ where: { ownerId: id, archived: false }, select: { id: true } })
    ).map((f) => f.id);
    const loaded = (await loadFarms()).filter((f) => farms.includes(f.id));
    const summaries = loaded.map(summarizeFarm);
    const animals = await prisma.animal.findMany({
      where: { group: { farm: { ownerId: id } } },
      include: { group: { include: { farm: true } } },
      orderBy: { id: 'asc' },
    });
    const transfers = await prisma.ownershipTransfer.findMany({
      where: { OR: [{ fromOwnerId: id }, { toOwnerId: id }] },
      include: { animal: true, fromOwner: true, toOwner: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    const farmNames = new Map(
      (await prisma.farm.findMany({ select: { id: true, name: true } })).map((f) => [f.id, f.name]),
    );
    const vaccinations = await prisma.vaccination.findMany({
      where: { farm: { ownerId: id } },
      include: { farm: true, group: true, animal: true },
      orderBy: { date: 'desc' },
    });
    const cases = await prisma.diseaseCase.findMany({
      where: { ownerId: id },
      include: { farm: true, owner: true, assignedTo: true },
      orderBy: { reportedAt: 'desc' },
    });
    const strays = await prisma.strayIncident.findMany({
      where: { ownerId: id },
      orderBy: { discoveredAt: 'desc' },
    });
    res.json({
      owner: {
        id: o.id,
        code: o.code,
        fullName: o.fullName,
        barangay: o.barangay,
        zone: o.zone,
        street: o.street,
        contact: o.contact,
        rsbsa: o.rsbsa,
        remarks: o.remarks,
        status: o.status,
        registeredAt: o.registeredAt,
      },
      stats: {
        farms: summaries.length,
        livestock: summaries.reduce((a, s) => a + s.total, 0),
        tagged: animals.filter((a) => a.status === 'ACTIVE').length,
        cases: cases.length,
      },
      farms: summaries,
      animals: animals.map((a) => ({
        id: a.id,
        code: a.code,
        earTag: a.earTag,
        species: a.species,
        sex: a.sex,
        status: a.status,
        ownerName: o.fullName,
        farmName: a.group.farm.name,
      })),
      transfers: transfers.map((t) => serializeTransfer(t, farmNames)),
      vaccinations: vaccinations.map(serializeVaccination),
      cases: cases.map(serializeCase),
      strays: strays.map((s) => ({
        id: s.id,
        code: s.code,
        discoveredAt: s.discoveredAt,
        species: s.species,
        status: s.status,
        violations: s.violations,
        barangay: s.barangay,
      })),
      pcic: o.pcicPolicies.map((p) => ({
        id: p.id,
        policyNo: p.policyNo,
        species: p.species,
        heads: p.heads,
        amountCovered: p.amountCovered ? Number(p.amountCovered) : null,
        startDate: ymd(p.startDate),
        endDate: ymd(p.endDate),
        status: p.status,
        remarks: p.remarks,
      })),
    });
  }),
);

ownersRouter.post(
  '/',
  ah(async (req, res) => {
    const { confirmDuplicate, ...data } = parse(ownerCreateSchema, req.body);
    await checkDuplicates({ ...data, confirmDuplicate });
    const owner = await prisma.$transaction(async (tx) => {
      const created = await tx.owner.create({ data: { ...data, code: tempCode() } });
      const o = await tx.owner.update({
        where: { id: created.id },
        data: { code: displayCode('OWN', created.id) },
      });
      await logActivity(
        'owner',
        o.id,
        'created',
        `Owner ${o.code} registered (${o.fullName})`,
        req.user?.name,
        tx,
      );
      return o;
    });
    res.status(201).json(owner);
  }),
);

ownersRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const data = parse(ownerUpdateSchema, req.body);
    const existing = await prisma.owner.findUnique({ where: { id } });
    if (!existing) throw notFound('Owner');
    const nameChanged = data.fullName !== existing.fullName || data.barangay !== existing.barangay;
    await checkDuplicates({ ...data, confirmDuplicate: data.confirmDuplicate || !nameChanged }, id);
    if (data.status === 'ARCHIVED' && existing.status !== 'ARCHIVED') {
      const active = await prisma.farm.count({ where: { ownerId: id, archived: false } });
      if (active > 0)
        throw badRequest(`This owner still has ${active} active farm(s). Use Archive to resolve them first.`);
    }
    const o = await prisma.owner.update({
      where: { id },
      data: {
        fullName: data.fullName,
        barangay: data.barangay,
        zone: data.zone ?? null,
        street: data.street ?? null,
        contact: data.contact ?? null,
        rsbsa: data.rsbsa ?? null,
        remarks: data.remarks ?? null,
        ...(data.status ? { status: data.status } : {}),
      },
    });
    await logActivity('owner', id, 'updated', `Owner ${o.code} updated`, req.user?.name);
    res.json(o);
  }),
);

/** Archive check used by the Archive dialog. */
ownersRouter.get(
  '/:id/archive-check',
  ah(async (req, res) => {
    const id = idParam(req);
    const farms = await prisma.farm.findMany({
      where: { ownerId: id, archived: false },
      include: {
        groups: { where: { archived: false }, include: { animals: { where: { status: 'ACTIVE' } } } },
        cases: { where: { closedAt: null }, select: { id: true } },
      },
      orderBy: { id: 'asc' },
    });
    res.json({
      farms: farms.map((f) => {
        const head = f.groups.reduce((a, g) => a + g.count, 0);
        const tagged = f.groups.reduce((a, g) => a + g.animals.length, 0);
        const blockers: string[] = [];
        if (head > 0) blockers.push('Farm has population groups with animals');
        if (tagged > 0) blockers.push('Farm has active tagged animals');
        if (f.cases.length) blockers.push(`Farm has ${f.cases.length} open disease case(s)`);
        return { id: f.id, code: f.code, name: f.name, barangay: f.barangay, head, tagged, blockers };
      }),
    });
  }),
);

ownersRouter.post(
  '/:id/archive',
  ah(async (req, res) => {
    const id = idParam(req);
    const active = await prisma.farm.count({ where: { ownerId: id, archived: false } });
    if (active > 0) throw badRequest(`This owner still has ${active} active farm(s).`);
    const o = await prisma.owner.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await logActivity('owner', id, 'archived', `Owner ${o.code} archived`, req.user?.name);
    res.json(o);
  }),
);

ownersRouter.post(
  '/:id/restore',
  ah(async (req, res) => {
    const id = idParam(req);
    const o = await prisma.owner.update({ where: { id }, data: { status: 'ACTIVE' } });
    await logActivity('owner', id, 'restored', `Owner ${o.code} restored`, req.user?.name);
    res.json(o);
  }),
);

ownersRouter.post(
  '/:id/pcic',
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(pcicCreateSchema, req.body);
    if (d.endDate < d.startDate)
      throw badRequest('Validation failed', { fieldErrors: { endDate: ['End date is before start date'] } });
    const p = await prisma.pcicPolicy.create({
      data: {
        ownerId: id,
        policyNo: d.policyNo,
        species: d.species,
        heads: d.heads,
        amountCovered: d.amountCovered ?? null,
        startDate: dateOnly(d.startDate)!,
        endDate: dateOnly(d.endDate)!,
        status: d.status,
        remarks: d.remarks ?? null,
      },
    });
    await logActivity('owner', id, 'pcic', `PCIC policy ${p.policyNo} recorded`, req.user?.name);
    res.status(201).json(p);
  }),
);