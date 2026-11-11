import {
  CASE_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  VISIT_PURPOSES,
  VISIT_PURPOSE_LABELS,
  addMonths,
  fmtMonth,
  isoMonth,
} from '@livestock/shared';
import { prisma } from '../db';
import { ymd } from '../lib/dates';
import { loadFarms, populationTotals } from './metrics';

const monthRange = (m: string) => ({
  gte: new Date(`${m}-01T00:00:00Z`),
  lt: new Date(`${addMonths(m, 1)}-01T00:00:00Z`),
});
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const countBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
};

/**
 * Monthly summary for the office: livestock population (current masterlist), disease reports,
 * deworming, check-ups and other services, and farm visits for one month, plus a 6-month trend.
 */
export async function monthlySummary(month = isoMonth(), barangay?: string) {
  const range = monthRange(month);
  const brgy = barangay ? { barangay } : {};
  const farms = await loadFarms({ barangay });
  const pop = populationTotals(farms);

  const [cases, services, visits] = await Promise.all([
    prisma.diseaseCase.findMany({
      where: { voidedAt: null, reportedAt: range, ...brgy },
      include: { farm: { select: { name: true } } },
      orderBy: { reportedAt: 'asc' },
    }),
    prisma.vaccination.findMany({
      where: { voidedAt: null, date: range, ...(barangay ? { farm: { barangay } } : {}) },
      include: { farm: { select: { name: true, barangay: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.farmVisit.findMany({
      where: { date: range, ...(barangay ? { farm: { barangay } } : {}) },
      include: { farm: { select: { name: true, barangay: true } } },
      orderBy: { date: 'asc' },
    }),
  ]);
  const openCases = await prisma.diseaseCase.count({ where: { voidedAt: null, closedAt: null, ...brgy } });

  const serviceRows = SERVICE_TYPES.map((t) => {
    const xs = services.filter((s) => s.serviceType === t);
    const bySpecies = new Map<string, { species: string; head: number; farms: Set<number> }>();
    for (const s of xs) {
      const r = bySpecies.get(s.species) ?? { species: s.species, head: 0, farms: new Set<number>() };
      r.head += s.count;
      r.farms.add(s.farmId);
      bySpecies.set(s.species, r);
    }
    return {
      type: t,
      label: SERVICE_TYPE_LABELS[t],
      records: xs.length,
      head: sum(xs.map((s) => s.count)),
      farms: new Set(xs.map((s) => s.farmId)).size,
      bySpecies: [...bySpecies.values()]
        .map((r) => ({ species: r.species, head: r.head, farms: r.farms.size }))
        .sort((a, b) => b.head - a.head),
    };
  });

  // Six-month trend ending in the chosen month.
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const trendFrom = monthRange(months[0]).gte;
  const [tCases, tServices, tVisits] = await Promise.all([
    prisma.diseaseCase.findMany({
      where: { voidedAt: null, reportedAt: { gte: trendFrom, lt: range.lt }, ...brgy },
      select: { reportedAt: true },
    }),
    prisma.vaccination.findMany({
      where: {
        voidedAt: null,
        date: { gte: trendFrom, lt: range.lt },
        ...(barangay ? { farm: { barangay } } : {}),
      },
      select: { date: true, serviceType: true, count: true },
    }),
    prisma.farmVisit.findMany({
      where: { date: { gte: trendFrom, lt: range.lt }, ...(barangay ? { farm: { barangay } } : {}) },
      select: { date: true },
    }),
  ]);
  const inMonth = (d: Date, m: string) => ymd(d)!.slice(0, 7) === m;
  const trend = months.map((m) => ({
    month: m,
    label: fmtMonth(m),
    diseaseReports: tCases.filter((c) => inMonth(c.reportedAt, m)).length,
    dewormed: sum(
      tServices.filter((s) => s.serviceType === 'DEWORMING' && inMonth(s.date, m)).map((s) => s.count),
    ),
    checkups: sum(
      tServices.filter((s) => s.serviceType === 'CHECKUP' && inMonth(s.date, m)).map((s) => s.count),
    ),
    visits: tVisits.filter((v) => inMonth(v.date, m)).length,
  }));

  return {
    month,
    label: fmtMonth(month),
    barangay: barangay ?? null,
    population: {
      total: pop.total,
      farms: farms.length,
      owners: new Set(farms.map((f) => f.ownerId)).size,
      bySpecies: pop.bySpecies.map((s) => ({
        species: s.species,
        population: s.population,
        farms: s.farms,
        breakdown: s.breakdown,
        classified: sum(Object.values(s.breakdown)),
      })),
      byBarangay: pop.byBarangay,
    },
    diseases: {
      reported: cases.length,
      positive: cases.filter((c) => c.status === 'POSITIVE').length,
      openCases,
      byDisease: countBy(cases, (c) => c.disease),
      byBarangay: countBy(cases, (c) => c.barangay),
      cases: cases.map((c) => ({
        id: c.id,
        code: c.code,
        disease: c.disease,
        species: c.species,
        barangay: c.barangay,
        farmName: c.farm?.name ?? null,
        affected: c.affected,
        deaths: c.deaths,
        status: c.status,
        statusLabel: CASE_STATUS_LABELS[c.status],
        reportedAt: ymd(c.reportedAt),
        closed: c.closedAt != null,
      })),
    },
    services: serviceRows,
    visits: {
      total: visits.length,
      farms: new Set(visits.map((v) => v.farmId)).size,
      sickFound: visits.filter((v) => v.findings === 'SICK_ANIMALS').length,
      byPurpose: VISIT_PURPOSES.map((p) => ({
        purpose: p,
        label: VISIT_PURPOSE_LABELS[p],
        count: visits.filter((v) => v.purpose === p).length,
      })),
    },
    trend,
  };
}
export type MonthlySummary = Awaited<ReturnType<typeof monthlySummary>>;
