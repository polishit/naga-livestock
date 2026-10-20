/**
 * Authoritative metrics module. The dashboard, analytics, reports and exports all derive their
 * figures from these functions so every screen agrees.
 */
import {
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  SPECIES,
  addMonths,
  distanceMeters,
  fmtMonth,
  isoMonth,
  lastMonths,
  roundDistance,
  type CaseStatus,
} from '@livestock/shared';
import { prisma } from '../db';
import { today, ymd } from '../lib/dates';
import { getSettings } from './settings';

export interface Filters {
  barangay?: string;
  species?: string;
  caseStatus?: string;
}

export type RecordStatus = 'verified' | 'overdue' | 'outdated' | 'no_groups';
export const RECORD_STATUS_LABEL: Record<RecordStatus, string> = {
  verified: 'Verified this month',
  overdue: 'Overdue',
  outdated: 'Outdated',
  no_groups: 'No groups',
};

/** Load active farms (and their active groups) for the given filters. */
export async function loadFarms(f: Filters = {}) {
  const farms = await prisma.farm.findMany({
    where: {
      archived: false,
      owner: { status: { not: 'ARCHIVED' } },
      ...(f.barangay ? { barangay: f.barangay } : {}),
    },
    include: {
      owner: true,
      groups: {
        where: { archived: false, ...(f.species ? { species: f.species } : {}) },
        include: {
          updates: { orderBy: [{ month: 'asc' }, { id: 'asc' }] },
          animals: { where: { status: 'ACTIVE' }, select: { id: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });
  return farms;
}
export type LoadedFarm = Awaited<ReturnType<typeof loadFarms>>[number];

export function recordStatus(groups: { lastVerified: string | null }[], month = isoMonth()): RecordStatus {
  if (groups.length === 0) return 'no_groups';
  const verified = groups.map((g) => g.lastVerified ?? '0000-00').sort();
  const stalest = verified[0];
  if (stalest >= month) return 'verified';
  if (stalest >= addMonths(month, -1)) return 'overdue';
  return 'outdated';
}

export function summarizeFarm(farm: LoadedFarm) {
  const bySpecies = new Map<string, number>();
  let total = 0;
  let tagged = 0;
  for (const g of farm.groups) {
    total += g.count;
    tagged += g.animals.length;
    bySpecies.set(g.species, (bySpecies.get(g.species) ?? 0) + g.count);
  }
  const species = [...bySpecies.entries()].map(([s, count]) => ({ species: s, count }));
  const status = recordStatus(farm.groups);
  return {
    id: farm.id,
    code: farm.code,
    name: farm.name,
    type: farm.type,
    barangay: farm.barangay,
    zone: farm.zone,
    address: farm.address,
    lat: farm.lat,
    lng: farm.lng,
    mapped: farm.lat != null && farm.lng != null,
    ownerId: farm.ownerId,
    ownerName: farm.owner.fullName,
    ownerContact: farm.owner.contact,
    total,
    tagged,
    groups: farm.groups.length,
    species,
    recordStatus: status,
    recordStatusLabel: RECORD_STATUS_LABEL[status],
  };
}
export type FarmSummary = ReturnType<typeof summarizeFarm>;

export function populationTotals(farms: LoadedFarm[]) {
  const byBarangay = new Map<
    string,
    { barangay: string; owners: Set<number>; farms: number; population: number }
  >();
  const bySpecies = new Map<
    string,
    { species: string; groups: number; tagged: number; population: number }
  >();
  let total = 0;
  for (const farm of farms) {
    const b = byBarangay.get(farm.barangay) ?? {
      barangay: farm.barangay,
      owners: new Set(),
      farms: 0,
      population: 0,
    };
    b.owners.add(farm.ownerId);
    b.farms += 1;
    for (const g of farm.groups) {
      b.population += g.count;
      total += g.count;
      const s = bySpecies.get(g.species) ?? { species: g.species, groups: 0, tagged: 0, population: 0 };
      s.groups += 1;
      s.tagged += g.animals.length;
      s.population += g.count;
      bySpecies.set(g.species, s);
    }
    byBarangay.set(farm.barangay, b);
  }
  return {
    total,
    byBarangay: [...byBarangay.values()]
      .map((b) => ({ barangay: b.barangay, owners: b.owners.size, farms: b.farms, population: b.population }))
      .sort((a, b) => a.barangay.localeCompare(b.barangay)),
    bySpecies: [...bySpecies.values()].sort((a, b) => b.population - a.population),
  };
}

/**
 * Monthly population trend. For each month every group contributes either its verified update
 * for that month (or "adjusted" if the month was amended), or its last known value carried forward.
 */
export function monthlyTrend(farms: LoadedFarm[], months: string[]) {
  return months.map((m) => {
    let verified = 0;
    let carried = 0;
    let adjusted = 0;
    for (const farm of farms) {
      for (const g of farm.groups) {
        const active = g.updates.filter((u) => !u.superseded);
        const inMonth = active.filter((u) => u.month === m).at(-1);
        if (inMonth) {
          const amended = g.updates.some((u) => u.superseded && u.month === m);
          if (amended) adjusted += inMonth.count;
          else verified += inMonth.count;
          continue;
        }
        const before = active.filter((u) => u.month < m).at(-1);
        if (before) carried += before.count;
      }
    }
    return {
      month: m,
      label: fmtMonth(m),
      verified,
      carried,
      adjusted,
      total: verified + carried + adjusted,
    };
  });
}

/** Vaccination coverage per species (estimated from group events; exact for tagged animals). */
export async function vaccinationCoverage(
  f: Filters & { from?: string; to?: string },
  farmsIn?: LoadedFarm[],
) {
  const farms = farmsIn ?? (await loadFarms({ barangay: f.barangay }));
  const to = f.to ?? today();
  const from = f.from ?? `${addMonths(to.slice(0, 7), -5)}-01`;
  const farmIds = farms.map((x) => x.id);
  const vax = await prisma.vaccination.findMany({
    where: {
      farmId: { in: farmIds },
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
  });
  const pop = populationTotals(farms);
  const species = SPECIES.filter((s) => s !== 'Other' || pop.bySpecies.some((p) => p.species === 'Other'));
  const rows = species
    .filter((s) => !f.species || f.species === s)
    .map((s) => {
      const population = pop.bySpecies.find((p) => p.species === s)?.population ?? 0;
      const tagged = pop.bySpecies.find((p) => p.species === s)?.tagged ?? 0;
      const sv = vax.filter((v) => v.species === s);
      const groupFirstDoses = sv
        .filter((v) => v.target === 'GROUP' && v.doseNumber === 1)
        .reduce((a, v) => a + v.count, 0);
      const animalIds = new Set(sv.filter((v) => v.target === 'ANIMAL' && v.animalId).map((v) => v.animalId));
      const estimatedHeads = Math.min(population, groupFirstDoses + animalIds.size);
      const exactVaccinated = Math.min(tagged, animalIds.size);
      return {
        species: s,
        population,
        tagged,
        estimatedHeads,
        estimatedPct: population ? Math.round((estimatedHeads / population) * 100) : 0,
        exactVaccinated,
        exactPct: tagged ? Math.round((exactVaccinated / tagged) * 100) : null,
        events: sv.length,
        doses: sv.reduce((a, v) => a + v.count, 0),
      };
    })
    .sort((a, b) => b.events - a.events || b.population - a.population);
  const totalPop = rows.reduce((a, r) => a + r.population, 0);
  const totalEst = rows.reduce((a, r) => a + r.estimatedHeads, 0);
  return { from, to, rows, overallPct: totalPop ? Math.round((totalEst / totalPop) * 100) : 0 };
}

export async function loadCases(f: Filters = {}) {
  return prisma.diseaseCase.findMany({
    where: {
      ...(f.barangay ? { barangay: f.barangay } : {}),
      ...(f.species ? { species: f.species } : {}),
      ...(f.caseStatus && (CASE_STATUSES as readonly string[]).includes(f.caseStatus)
        ? { status: f.caseStatus as CaseStatus }
        : {}),
    },
    include: { farm: true, owner: true, assignedTo: true, relatedCase: true },
    orderBy: { reportedAt: 'desc' },
  });
}

/** Everything the dashboard and analytics pages need, from one consistent snapshot. */
export async function overview(f: Filters & { months?: number }) {
  const monthsN = f.months ?? 6;
  const months = lastMonths(monthsN);
  const farms = await loadFarms(f);
  const summaries = farms.map(summarizeFarm);
  const totals = populationTotals(farms);
  const cases = await loadCases(f);
  // Closed cases stay in history (charts) but no longer count as active.
  const openCases = cases.filter((c) => c.closedAt == null);
  const ownersCount = await prisma.owner.count({
    where: { status: { not: 'ARCHIVED' }, ...(f.barangay ? { barangay: f.barangay } : {}) },
  });
  const coverage = await vaccinationCoverage({ ...f, from: `${months[0]}-01` }, farms);

  const withGroups = summaries.filter((s) => s.recordStatus !== 'no_groups');
  const verifiedCount = withGroups.filter((s) => s.recordStatus === 'verified').length;

  const casesPerMonth = months.map((m) => {
    const inMonth = cases.filter((c) => ymd(c.reportedAt)!.startsWith(m));
    return {
      month: m,
      label: fmtMonth(m),
      reported: inMonth.length,
      positive: inMonth.filter((c) => c.status === 'POSITIVE').length,
    };
  });

  const vaxRecords = await prisma.vaccination.findMany({
    where: { farmId: { in: farms.map((x) => x.id) }, date: { gte: new Date(`${months[0]}-01T00:00:00Z`) } },
  });
  const vaccinationActivity = months.map((m) => {
    const inMonth = vaxRecords.filter((v) => ymd(v.date)!.startsWith(m));
    return {
      month: m,
      label: fmtMonth(m),
      events: inMonth.length,
      doses: inMonth.reduce((a, v) => a + v.count, 0),
    };
  });

  const recent = await prisma.activityLog.findMany({
    where: { entity: 'case' },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });

  const attention = [
    ...summaries
      .filter((s) => s.recordStatus === 'overdue' || s.recordStatus === 'outdated')
      .sort((a, b) =>
        a.recordStatus === b.recordStatus ? a.id - b.id : a.recordStatus === 'overdue' ? -1 : 1,
      )
      .map((s) => ({
        label: s.name,
        kind: s.recordStatus === 'overdue' ? 'Overdue' : 'Outdated',
        href: `/farms/${s.id}`,
      })),
    ...openCases
      .filter((c) => c.lat == null || c.lng == null)
      .map((c) => ({ label: `${c.code} needs location`, kind: 'Geotag', href: `/cases/${c.id}` })),
  ];

  const byType = new Map<string, number>();
  for (const s of summaries) byType.set(s.type, (byType.get(s.type) ?? 0) + 1);

  const byDisease = new Map<string, number>();
  for (const c of cases) byDisease.set(c.disease, (byDisease.get(c.disease) ?? 0) + 1);

  return {
    stats: {
      owners: ownersCount,
      farms: summaries.length,
      outdatedFarms: summaries.filter((s) => s.recordStatus === 'outdated').length,
      livestock: totals.total,
      verifiedPct: withGroups.length ? Math.round((verifiedCount / withGroups.length) * 100) : 0,
      suspected: openCases.filter((c) => c.status === 'SUSPECTED' || c.status === 'SAMPLE_COLLECTED').length,
      inLab: openCases.filter((c) => c.status === 'SENT_TO_LAB' || c.status === 'AWAITING_RESULT').length,
      positive: openCases.filter((c) => c.status === 'POSITIVE').length,
      coveragePct: coverage.overallPct,
      awaitingGeotag: openCases.filter((c) => c.lat == null || c.lng == null).length,
    },
    map: {
      farms: summaries.filter((s) => s.mapped),
      cases: openCases
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({
          id: c.id,
          code: c.code,
          disease: c.disease,
          status: c.status,
          lat: c.lat!,
          lng: c.lng!,
          farmName: c.farm.name,
          barangay: c.barangay,
          species: c.species,
          affected: c.affected,
          deaths: c.deaths,
        })),
    },
    recent: recent.map((r) => ({
      id: r.id,
      summary: r.summary,
      byName: r.byName,
      at: r.createdAt,
      entityId: r.entityId,
    })),
    bySpecies: totals.bySpecies.map((s) => ({ species: s.species, count: s.population })),
    byBarangay: totals.byBarangay.map((b) => ({ barangay: b.barangay, count: b.population })),
    trend: monthlyTrend(farms, months),
    casesPerMonth,
    coverage: coverage.rows,
    attention,
    casesByStatus: CASE_STATUSES.map((s) => ({
      status: s,
      label: CASE_STATUS_LABELS[s],
      count: cases.filter((c) => c.status === s).length,
    })).filter((x) => x.count > 0),
    casesByDisease: [...byDisease.entries()]
      .map(([disease, count]) => ({ disease, count }))
      .sort((a, b) => b.count - a.count),
    vaccinationActivity,
    farmsByType: [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    largestFarms: [...summaries]
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((s) => ({ id: s.id, name: s.name, total: s.total })),
  };
}

/** Farms within an assessment radius of a geocoded disease case. */
export async function radiusAnalysis(caseId: number, radiusMeters?: number) {
  const settings = await getSettings();
  const radius = radiusMeters && radiusMeters > 0 ? radiusMeters : settings.defaultRadiusMeters;
  const c = await prisma.diseaseCase.findUnique({
    where: { id: caseId },
    include: { farm: true, owner: true },
  });
  if (!c) return null;
  const farms = await loadFarms();
  const excluded = farms.filter((x) => x.lat == null || x.lng == null);
  if (c.lat == null || c.lng == null) {
    return { case: c, radius, geocoded: false as const, farms: [], totals: null, excluded: excluded.length };
  }
  const rows = farms
    .filter((x) => x.lat != null && x.lng != null)
    .map((x) => ({ farm: x, distance: distanceMeters(c.lat!, c.lng!, x.lat!, x.lng!) }))
    .filter((r) => r.distance <= radius || r.farm.id === c.farmId)
    .sort((a, b) => a.distance - b.distance)
    .map((r) => {
      const s = summarizeFarm(r.farm);
      const isGz = r.farm.id === c.farmId;
      return {
        ...s,
        distance: isGz ? 0 : roundDistance(r.distance),
        role: isGz ? 'Ground-zero farm' : 'Nearby farm',
      };
    });
  const species = new Map<string, number>();
  for (const r of rows)
    for (const s of r.species) species.set(s.species, (species.get(s.species) ?? 0) + s.count);
  return {
    case: c,
    radius,
    geocoded: true as const,
    center: { lat: c.lat, lng: c.lng },
    farms: rows,
    totals: {
      farms: rows.length,
      nearby: rows.filter((r) => r.role !== 'Ground-zero farm').length,
      groundZero: rows.some((r) => r.role === 'Ground-zero farm') ? 1 : 0,
      livestock: rows.reduce((a, r) => a + r.total, 0),
      owners: new Set(rows.map((r) => r.ownerId)).size,
      species: [...species.entries()]
        .map(([s, count]) => ({ species: s, count }))
        .sort((a, b) => b.count - a.count),
    },
    excluded: excluded.length,
  };
}
