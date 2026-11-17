import {
  POP_REASON_LABELS,
  caseStage,
  distanceMeters,
  formatDistance,
  isLargeRuminant,
  isoDate,
  isoMonth,
  measureOpen,
  roundDistance,
  type CaseStage,
  type NotificationType,
  type PopReason,
} from '@livestock/shared';
import { prisma, type Prisma } from '../db';
import { displayCode, logActivity, tempCode } from '../lib/activity';
import { ymd } from '../lib/dates';
import { badRequest } from '../lib/http';
import { adjustGroupCount } from '../routes/population';

/**
 * Logic shared by the owner app routes (/api/my) and the CVO review routes: notifications,
 * applying a head count change, turning an approved registration into a farm, and the stage of a
 * disease report.
 */

type Tx = Prisma.TransactionClient | typeof prisma;

export interface OwnerNotice {
  type: NotificationType;
  title: string;
  body: string;
  /** Path inside the owner app */
  link?: string;
  /** Set to make sure the same notice is never sent twice to one owner */
  refKey?: string;
}

/**
 * Put a notice in the in-app inbox of each owner that has a login. Owners who turned an optional
 * type off (vaccination, announcements) do not get it. Returns how many were sent.
 */
export async function notifyOwners(ownerIds: number[], n: OwnerNotice, tx: Tx = prisma): Promise<number> {
  const ids = [...new Set(ownerIds)];
  if (!ids.length) return 0;
  const users = await tx.user.findMany({
    where: { ownerId: { in: ids }, role: 'OWNER', status: 'ACTIVE' },
    select: { id: true, notifPrefs: true },
  });
  const to = users.filter((u) => {
    const muted = ((u.notifPrefs as { muted?: string[] } | null)?.muted ?? []) as string[];
    return !muted.includes(n.type);
  });
  if (!to.length) return 0;
  const r = await tx.notification.createMany({
    data: to.map((u) => ({
      userId: u.id,
      type: n.type,
      title: n.title.slice(0, 160),
      body: n.body,
      link: n.link ?? null,
      refKey: n.refKey ?? null,
    })),
    skipDuplicates: true,
  });
  return r.count;
}
export const notifyOwner = (ownerId: number, n: OwnerNotice, tx: Tx = prisma) =>
  notifyOwners([ownerId], n, tx);

/** Owners (verified, with a farm that is not archived) in a barangay, or in the whole city. */
export async function ownersInBarangay(barangay: string | null, species?: string | null) {
  const farms = await prisma.farm.findMany({
    where: {
      archived: false,
      owner: { status: 'ACTIVE' },
      ...(barangay ? { barangay } : {}),
      ...(species ? { groups: { some: { species, archived: false, count: { gt: 0 } } } } : {}),
    },
    select: { ownerId: true },
  });
  return [...new Set(farms.map((f) => f.ownerId))];
}

/** Farms with a map pin inside a circle, nearest first (archived farms left out). */
export async function farmsInCircle(lat: number, lng: number, radiusM: number) {
  const farms = await prisma.farm.findMany({
    where: { archived: false, lat: { not: null }, lng: { not: null } },
    select: { id: true, code: true, name: true, barangay: true, ownerId: true, lat: true, lng: true },
  });
  return farms
    .map((f) => ({ ...f, distance: roundDistance(distanceMeters(lat, lng, f.lat!, f.lng!)) }))
    .filter((f) => f.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance);
}

/* ---------------- head count ---------------- */

/** The signed change in head a request asks for, given the count now. */
export function requestedDelta(reason: PopReason, quantity: number, current: number) {
  if (reason === 'CORRECTION') return quantity - current;
  return ['BIRTH', 'PURCHASE'].includes(reason) ? quantity : -quantity;
}

/**
 * Unusually large changes are held for a reviewer: more than the set share of the current count
 * and at least the set number of head. Everything else is accepted automatically.
 */
export function flagReason(
  delta: number,
  before: number,
  s: { popFlagPercent: number; popFlagMinHeads: number },
) {
  const size = Math.abs(delta);
  if (size < s.popFlagMinHeads) return null;
  if (before === 0) return `New livestock of ${size} head (the review limit is ${s.popFlagMinHeads})`;
  const pct = Math.round((size / before) * 100);
  if (pct > s.popFlagPercent)
    return `Change of ${size} head is ${pct}% of the recorded ${before} (the review limit is ${s.popFlagPercent}%)`;
  return null;
}

/** A livestock group for a species on a farm, created with a starting count. */
export async function createGroup(
  tx: Prisma.TransactionClient,
  farm: { id: number; name: string },
  species: string,
  count: number,
  by: string | null,
  note = 'Initial count',
) {
  const created = await tx.populationGroup.create({
    data: {
      code: tempCode(),
      farmId: farm.id,
      species,
      count,
      purpose: isLargeRuminant(species) ? null : null,
      lastVerified: isoMonth(),
    },
  });
  const g = await tx.populationGroup.update({
    where: { id: created.id },
    data: { code: displayCode('GRP', created.id) },
  });
  await tx.populationUpdate.create({
    data: {
      groupId: g.id,
      month: isoMonth(),
      count,
      previous: null,
      change: count,
      reason: note,
      createdBy: by,
    },
  });
  return g;
}

/**
 * Apply an owner's head count change to the farm's records. The change is re-checked against the
 * count at this moment (it may have changed since the owner sent it).
 */
export async function applyPopulationRequest(
  tx: Prisma.TransactionClient,
  r: {
    id: number;
    farmId: number;
    groupId: number | null;
    species: string;
    reason: string;
    quantity: number;
    note: string | null;
    createdBy: string | null;
  },
  decidedBy: string,
) {
  const farm = await tx.farm.findUnique({ where: { id: r.farmId } });
  if (!farm || farm.archived) throw badRequest('This farm is no longer active');
  const group =
    (r.groupId ? await tx.populationGroup.findUnique({ where: { id: r.groupId } }) : null) ??
    (await tx.populationGroup.findFirst({
      where: { farmId: r.farmId, species: r.species, archived: false },
      orderBy: { id: 'asc' },
    }));
  const before = group?.count ?? 0;
  const delta = r.quantity; // stored signed
  const after = before + delta;
  if (after < 0) throw badRequest(`Only ${before} ${r.species} are recorded; ${-delta} cannot be removed.`);
  const why = `Owner update (${POP_REASON_LABELS[r.reason as PopReason] ?? r.reason})${r.note ? `: ${r.note}` : ''}`;
  let groupId = group?.id ?? null;
  if (!group) {
    const g = await createGroup(tx, farm, r.species, after, r.createdBy, why);
    groupId = g.id;
  } else {
    const tagged = await tx.animal.count({ where: { groupId: group.id, status: 'ACTIVE' } });
    if (after < tagged)
      throw badRequest(
        `${group.code} has ${tagged} tagged animal(s); the count cannot go below that. Update the tagged animals first.`,
      );
    await adjustGroupCount(tx, group.id, delta, why, r.createdBy);
  }
  await tx.populationRequest.update({
    where: { id: r.id },
    data: { status: 'ACCEPTED', groupId, before, after, decidedBy, decidedAt: new Date() },
  });
  await logActivity(
    'farm',
    farm.id,
    'population-update',
    `${farm.name}: ${r.species} ${before} → ${after} (${POP_REASON_LABELS[r.reason as PopReason] ?? r.reason}, sent by the owner${decidedBy === 'System' ? ', accepted automatically' : `, accepted by ${decidedBy}`})`,
    r.createdBy,
    tx,
  );
  return { before, after };
}

/* ---------------- farm registration ---------------- */

/** Approving a registration creates the farm and its livestock groups. */
export async function approveFarmRegistration(tx: Prisma.TransactionClient, regId: number, by: string) {
  const reg = await tx.farmRegistration.findUnique({ where: { id: regId }, include: { owner: true } });
  if (!reg) throw badRequest('Registration not found');
  const created = await tx.farm.create({
    data: {
      code: tempCode(),
      ownerId: reg.ownerId,
      name: reg.name,
      type: reg.type,
      source: 'OWNER_APP',
      barangay: reg.barangay,
      zone: reg.zone,
      address: reg.address,
      lat: reg.lat,
      lng: reg.lng,
    },
  });
  const farm = await tx.farm.update({
    where: { id: created.id },
    data: { code: displayCode('FRM', created.id) },
  });
  for (const l of (reg.livestock as { species: string; count: number }[]) ?? [])
    await createGroup(
      tx,
      farm,
      l.species,
      l.count,
      reg.owner.fullName,
      'Declared by the owner at registration',
    );
  await tx.farmRegistration.update({
    where: { id: reg.id },
    data: { status: 'APPROVED', farmId: farm.id, returnReason: null, reviewedBy: by, reviewedAt: new Date() },
  });
  await logActivity(
    'farm',
    farm.id,
    'created',
    `Farm ${farm.code} (${farm.name}) registered by the owner and verified by ${by}`,
    by,
    tx,
  );
  return farm;
}

/* ---------------- disease reports ---------------- */

/** Stage of a disease case for the owner and the CVO (see CASE_STAGES). */
export function stageOfCase(c: {
  status: string;
  closedAt: Date | null;
  affected: number;
  deaths: number;
  populationReconciled: number;
  responses: {
    type: string;
    status: string;
    endDate: Date | null;
    voidedAt: Date | null;
    heads?: number | null;
  }[];
}): CaseStage {
  const today = isoDate();
  const live = c.responses.filter((r) => !r.voidedAt);
  const open = live.some((r) =>
    measureOpen({ type: r.type, status: r.status, endDate: ymd(r.endDate) }, today),
  );
  const culled = live.reduce((a, r) => a + (r.status === 'COMPLETED' ? (r.heads ?? 0) : 0), 0);
  const pending = Math.max(0, c.deaths + culled - c.populationReconciled);
  return caseStage({
    status: c.status,
    closedAt: c.closedAt,
    responseDone: live.length > 0 && !open && pending === 0,
  });
}

/** Tell the owner of a case that something changed (never names staff notes or other farms). */
export async function notifyCaseOwner(
  tx: Tx,
  caseId: number,
  event: 'POSITIVE' | 'NEGATIVE' | 'CLOSED' | 'REOPENED' | 'MEASURE',
  detail?: string,
) {
  const c = await tx.diseaseCase.findUnique({
    where: { id: caseId },
    select: { id: true, code: true, disease: true, ownerId: true, farm: { select: { name: true } } },
  });
  if (!c) return;
  const report = await tx.diseaseReport.findFirst({ where: { caseId }, select: { id: true } });
  const link = report ? `/app/reports/${report.id}` : `/app/reports/case-${c.id}`;
  const text: Record<typeof event, [string, string]> = {
    POSITIVE: [
      `${c.disease} confirmed at ${c.farm.name}`,
      `The laboratory result for ${c.code} is POSITIVE. Do not move, sell or slaughter animals from the farm, and wait for the instructions of the City Veterinary Office.`,
    ],
    NEGATIVE: [
      `Laboratory result: negative`,
      `The laboratory result for ${c.code} at ${c.farm.name} is negative. The office will tell you if anything else is needed.`,
    ],
    CLOSED: [
      `Case ${c.code} is closed`,
      `The case at ${c.farm.name} is closed.${detail ? ` ${detail}` : ''}`,
    ],
    REOPENED: [
      `Case ${c.code} was reopened`,
      `The City Veterinary Office reopened the case at ${c.farm.name}.`,
    ],
    MEASURE: [`Update on ${c.code}`, detail ?? `There is a new action on your farm ${c.farm.name}.`],
  };
  await notifyOwner(c.ownerId, { type: 'REPORT', title: text[event][0], body: text[event][1], link }, tx);
}

/** Notify the owners of the farms inside a monitoring zone (each with the distance to their farm). */
export async function notifyZone(zone: {
  id: number;
  code: string;
  caseId: number | null;
  disease: string;
  lat: number;
  lng: number;
  radiusM: number;
  guidance: string | null;
}) {
  // The farm of the case itself (ground zero) is told through its own case, not as "near your farm".
  const epicenter = zone.caseId
    ? (await prisma.diseaseCase.findUnique({ where: { id: zone.caseId }, select: { farmId: true } }))?.farmId
    : null;
  const farms = (await farmsInCircle(zone.lat, zone.lng, zone.radiusM)).filter((f) => f.id !== epicenter);
  let sent = 0;
  for (const f of farms)
    sent += await notifyOwner(f.ownerId, {
      type: 'ALERT',
      title: `${zone.disease} confirmed near your farm`,
      body:
        `A confirmed case of ${zone.disease} was recorded about ${formatDistance(f.distance)} from your farm ${f.name}. ` +
        `Your farm is inside the monitoring area (${formatDistance(zone.radiusM)}).` +
        (zone.guidance ? `\n\n${zone.guidance}` : '') +
        `\n\nWatch your animals closely and report any sick animal in this app right away.`,
      link: '/app/alerts',
      refKey: `zone-${zone.id}-farm-${f.id}`,
    });
  return { farms: farms.length, sent };
}
