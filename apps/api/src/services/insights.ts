/**
 * Insights for the Reports & Analytics module and the Dashboard: period comparison, disease hotspots,
 * data quality, vaccination targets, the accomplishment report and the staff task list.
 * Figures come from the same records (and metrics helpers) as every other screen.
 */
import {
  CASE_STATUS_LABELS,
  RESPONSE_TYPE_LABELS,
  RESPONSE_TYPES_WITH_END,
  addMonths,
  fmtDate,
  fmtMonth,
  isoMonth,
  lastMonths,
  type ReportResult,
  type ResponseType,
} from '@livestock/shared';
import { prisma } from '../db';
import { today, ymd } from '../lib/dates';
import { liveReminder } from '../routes/vaccinations';
import { loadFarms, monthlyTrend, summarizeFarm, type Filters } from './metrics';
import { getSettings } from './settings';

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const endOfDay = (s: string) => new Date(`${s}T23:59:59.999Z`);
/** 'YYYY-MM-DD' shifted by n days. */
const shiftDays = (s: string, n: number) => ymd(new Date(day(s).getTime() + n * 86400_000))!;
/** Last day of a 'YYYY-MM' month. */
const monthEnd = (m: string) => shiftDays(`${addMonths(m, 1)}-01`, -1);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ---------------- counts for a period ---------------- */

interface Period {
  from: string;
  to: string;
}

/** The activity numbers for one period (used by the comparison and the accomplishment report). */
async function periodCounts(p: Period, f: Filters = {}) {
  const range = { gte: day(p.from), lte: endOfDay(p.to) };
  const dateRange = { gte: day(p.from), lte: day(p.to) };
  const brgy = f.barangay ? { barangay: f.barangay } : {};
  const sp = f.species ? { species: f.species } : {};
  const [
    cases,
    closed,
    owners,
    farms,
    animals,
    transfers,
    vax,
    strays,
    visits,
    labsSent,
    labResults,
    measures,
  ] = await Promise.all([
    prisma.diseaseCase.findMany({ where: { reportedAt: range, ...brgy, ...sp } }),
    prisma.diseaseCase.count({ where: { closedAt: range, ...brgy, ...sp } }),
    prisma.owner.count({ where: { registeredAt: range, ...brgy } }),
    prisma.farm.count({ where: { createdAt: range, ...brgy } }),
    prisma.animal.count({
      where: { createdAt: range, ...sp, ...(f.barangay ? { group: { farm: brgy } } : {}) },
    }),
    prisma.ownershipTransfer.count({
      where: { date: dateRange, ...(f.species ? { animal: sp } : {}) },
    }),
    prisma.vaccination.findMany({
      where: { voidedAt: null, date: dateRange, ...sp, ...(f.barangay ? { farm: brgy } : {}) },
    }),
    prisma.strayIncident.findMany({ where: { discoveredAt: range, ...brgy, ...sp } }),
    prisma.investigation.count({
      where: { voidedAt: null, date: dateRange, case: { ...brgy, ...sp } },
    }),
    prisma.labRecord.count({ where: { voidedAt: null, sentAt: dateRange, case: { ...brgy, ...sp } } }),
    prisma.labRecord.findMany({
      where: { voidedAt: null, resultDate: dateRange, result: { not: 'PENDING' }, case: { ...brgy, ...sp } },
    }),
    prisma.responseActivity.findMany({
      where: {
        voidedAt: null,
        status: { not: 'PLANNED' },
        date: { lte: day(p.to) },
        // Done in the period, or still running during it (a quarantine without an end date is in force).
        OR: [
          { date: { gte: day(p.from) } },
          { status: 'ONGOING' },
          { endDate: { gte: day(p.from) } },
          { endDate: null, type: { in: RESPONSE_TYPES_WITH_END } },
        ],
        case: { ...brgy, ...sp },
      },
    }),
  ]);
  const fines = strays.filter((s) => s.fineAmount != null);
  return {
    casesReported: cases.length,
    casesPositive: cases.filter((c) => c.status === 'POSITIVE').length,
    casesByDisease: [...new Set(cases.map((c) => c.disease))]
      .map((d) => ({ disease: d, count: cases.filter((c) => c.disease === d).length }))
      .sort((a, b) => b.count - a.count),
    casesClosed: closed,
    newOwners: owners,
    newFarms: farms,
    animalsTagged: animals,
    transfers,
    vaccinationEvents: vax.length,
    vaccinationDoses: sum(vax.map((v) => v.count)),
    vaccinationByVaccine: [...new Set(vax.map((v) => `${v.vaccine}|${v.species}`))]
      .map((k) => {
        const [vaccine, species] = k.split('|');
        const rows = vax.filter((v) => v.vaccine === vaccine && v.species === species);
        return { vaccine, species, events: rows.length, doses: sum(rows.map((v) => v.count)) };
      })
      .sort((a, b) => b.doses - a.doses),
    strays: strays.length,
    impounded: strays.filter((s) => s.impoundedAt != null).length,
    released: strays.filter((s) => s.releasedAt != null).length,
    finesImposed: sum(fines.map((s) => Number(s.fineAmount))),
    finesCollected: sum(fines.filter((s) => s.finePaid).map((s) => Number(s.fineAmount))),
    visits,
    labsSent,
    labPositive: labResults.filter((l) => l.result === 'POSITIVE').length,
    labNegative: labResults.filter((l) => l.result === 'NEGATIVE').length,
    labOther: labResults.filter((l) => l.result !== 'POSITIVE' && l.result !== 'NEGATIVE').length,
    measures: [...new Set(measures.map((m) => m.type))]
      .map((t) => ({
        type: t,
        label: RESPONSE_TYPE_LABELS[t as ResponseType] ?? t,
        count: measures.filter((m) => m.type === t).length,
        heads: sum(measures.filter((m) => m.type === t).map((m) => m.heads ?? 0)),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Recorded population at the end of each listed month. */
async function populationAt(months: string[], f: Filters) {
  const trend = monthlyTrend(await loadFarms(f), months);
  return new Map(trend.map((t) => [t.month, t.total]));
}

/* ---------------- this period vs the one before ---------------- */

export interface Kpi {
  key: string;
  label: string;
  current: number;
  previous: number;
  /** Which direction is good news: more vaccinations is good, more cases is not. */
  better: 'up' | 'down' | 'neutral';
}

export async function comparePeriods(f: Filters & { months?: number }) {
  const n = Math.min(24, Math.max(1, f.months ?? 6));
  const cur = lastMonths(n);
  const prev = lastMonths(n, addMonths(cur[0], -1));
  const current = { from: `${cur[0]}-01`, to: today() };
  const previous = { from: `${prev[0]}-01`, to: monthEnd(prev.at(-1)!) };
  const [a, b, pop] = await Promise.all([
    periodCounts(current, f),
    periodCounts(previous, f),
    populationAt([...prev, ...cur], f),
  ]);
  const kpis: Kpi[] = [
    {
      key: 'population',
      label: 'Recorded population',
      current: pop.get(cur.at(-1)!) ?? 0,
      previous: pop.get(prev.at(-1)!) ?? 0,
      better: 'neutral',
    },
    {
      key: 'cases',
      label: 'Disease cases reported',
      current: a.casesReported,
      previous: b.casesReported,
      better: 'down',
    },
    {
      key: 'positive',
      label: 'Confirmed positive',
      current: a.casesPositive,
      previous: b.casesPositive,
      better: 'down',
    },
    {
      key: 'doses',
      label: 'Vaccine doses given',
      current: a.vaccinationDoses,
      previous: b.vaccinationDoses,
      better: 'up',
    },
    {
      key: 'visits',
      label: 'Field investigations',
      current: a.visits,
      previous: b.visits,
      better: 'neutral',
    },
    {
      key: 'owners',
      label: 'New owners registered',
      current: a.newOwners,
      previous: b.newOwners,
      better: 'up',
    },
    { key: 'strays', label: 'Stray incidents', current: a.strays, previous: b.strays, better: 'down' },
  ];
  const label = (p: Period) => `${fmtDate(p.from)} – ${fmtDate(p.to)}`;
  return {
    months: n,
    current: { ...current, label: label(current) },
    previous: { ...previous, label: label(previous) },
    kpis,
  };
}

/* ---------------- disease hotspots ---------------- */

export const HOTSPOT_WINDOW_DAYS = 30;

/**
 * A barangay is a hotspot when it has at least 2 cases reported in the last 30 days and that is at
 * least twice its usual monthly number (the average of the 12 months before). "Rising" means more
 * cases than usual, but below the hotspot line.
 */
export async function hotspots() {
  const t = today();
  const recentFrom = shiftDays(t, -HOTSPOT_WINDOW_DAYS + 1);
  const baseFrom = shiftDays(recentFrom, -365);
  const cases = await prisma.diseaseCase.findMany({
    where: { reportedAt: { gte: day(baseFrom) } },
    select: { barangay: true, reportedAt: true, disease: true, status: true, closedAt: true },
  });
  const rows = [...new Set(cases.map((c) => c.barangay))]
    .map((barangay) => {
      const mine = cases.filter((c) => c.barangay === barangay);
      const recent = mine.filter((c) => ymd(c.reportedAt)! >= recentFrom);
      const baseline = Math.round((mine.length - recent.length) / 1.2) / 10; // per 30 days, 1 decimal
      const level: 'hotspot' | 'rising' | 'normal' =
        recent.length >= 2 && recent.length >= 2 * baseline
          ? 'hotspot'
          : recent.length > baseline
            ? 'rising'
            : 'normal';
      return {
        barangay,
        recent: recent.length,
        baseline,
        level,
        positive: recent.filter((c) => c.status === 'POSITIVE').length,
        diseases: [...new Set(recent.map((c) => c.disease))],
      };
    })
    .filter((r) => r.recent > 0)
    .sort((a, b) =>
      a.level === b.level
        ? b.recent - a.recent
        : a.level === 'hotspot'
          ? -1
          : b.level === 'hotspot'
            ? 1
            : a.level === 'rising'
              ? -1
              : 1,
    );
  return { windowDays: HOTSPOT_WINDOW_DAYS, from: recentFrom, to: t, rows };
}

/* ---------------- data quality ---------------- */

export async function dataQuality(f: Filters = {}) {
  const brgy = f.barangay ? { barangay: f.barangay } : {};
  const [owners, farms, animals, openCases] = await Promise.all([
    prisma.owner.findMany({ where: { status: { not: 'ARCHIVED' }, ...brgy } }),
    loadFarms({ barangay: f.barangay }),
    prisma.animal.findMany({
      where: { status: 'ACTIVE', group: { archived: false, farm: { archived: false, ...brgy } } },
    }),
    prisma.diseaseCase.findMany({ where: { closedAt: null, ...brgy } }),
  ]);
  const summaries = farms.map(summarizeFarm);
  const withGroups = summaries.filter((s) => s.recordStatus !== 'no_groups');
  const incomplete = '/reports?tab=ownership&type=incomplete-records';
  const items = [
    {
      key: 'farm-location',
      label: 'Farms without a map location',
      missing: summaries.filter((s) => !s.mapped).length,
      total: summaries.length,
      href: '/farms?location=unmapped',
    },
    {
      key: 'head-count',
      label: 'Farms with an overdue head count',
      missing: withGroups.filter((s) => s.recordStatus === 'overdue' || s.recordStatus === 'outdated').length,
      total: withGroups.length,
      href: '/reports?tab=population&type=population-overdue',
    },
    {
      key: 'rsbsa',
      label: 'Owners without an RSBSA number',
      missing: owners.filter((o) => !o.rsbsa).length,
      total: owners.length,
      href: '/owners?rsbsa=no',
    },
    {
      key: 'contact',
      label: 'Owners without a contact number',
      missing: owners.filter((o) => !o.contact).length,
      total: owners.length,
      href: incomplete,
    },
    {
      key: 'animal-id',
      label: 'Tagged animals missing a photo, marks or ear tag',
      missing: animals.filter((a) => {
        const photos = (a.photoKeys as string[] | null) ?? [];
        return !photos.length || (!a.markings && !a.cowlick) || !a.earTag;
      }).length,
      total: animals.length,
      href: incomplete,
    },
    {
      key: 'case-location',
      label: 'Open cases without a location',
      missing: openCases.filter((c) => c.lat == null || c.lng == null).length,
      total: openCases.length,
      href: '/cases?location=unmapped',
    },
  ];
  const total = sum(items.map((i) => i.total));
  const missing = sum(items.map((i) => i.missing));
  return { score: total ? Math.round(((total - missing) / total) * 100) : 100, items };
}

/* ---------------- vaccination targets ---------------- */

export interface VaxTarget {
  vaccine: string;
  species: string;
  target: number;
}
const targetsKey = (year: number) => `vaccinationTargets:${year}`;

export async function getTargets(year: number): Promise<VaxTarget[]> {
  const row = await prisma.setting.findUnique({ where: { key: targetsKey(year) } });
  try {
    return row ? (JSON.parse(row.value) as VaxTarget[]) : [];
  } catch {
    return [];
  }
}

export async function saveTargets(year: number, targets: VaxTarget[]) {
  const value = JSON.stringify(targets);
  await prisma.setting.upsert({
    where: { key: targetsKey(year) },
    create: { key: targetsKey(year), value },
    update: { value },
  });
}

/** Progress of each yearly target: doses given this year for that vaccine and species. */
export async function targetProgress(year: number) {
  const targets = await getTargets(year);
  const vax = await prisma.vaccination.findMany({
    where: { voidedAt: null, date: { gte: day(`${year}-01-01`), lte: day(`${year}-12-31`) } },
    select: { vaccine: true, species: true, count: true },
  });
  const t = today();
  const yearDone =
    String(year) < t.slice(0, 4)
      ? 1
      : String(year) > t.slice(0, 4)
        ? 0
        : (day(t).getTime() - day(`${year}-01-01`).getTime()) / (365 * 86400_000);
  return {
    year,
    // Share of the year already gone, to judge whether a target is on track.
    yearElapsedPct: Math.round(yearDone * 100),
    rows: targets.map((tg) => {
      const given = sum(
        vax
          .filter(
            (v) =>
              v.species === tg.species && v.vaccine.trim().toLowerCase() === tg.vaccine.trim().toLowerCase(),
          )
          .map((v) => v.count),
      );
      const pct = tg.target ? Math.round((given / tg.target) * 100) : 0;
      return { ...tg, given, pct, onTrack: pct >= Math.round(yearDone * 100) };
    }),
  };
}

/* ---------------- accomplishment report ---------------- */

/** One report of everything the office did in a period, for submission upward. */
export async function accomplishmentReport(
  p: { barangay?: string; species?: string; from?: string; to?: string },
  base: { id: string; title: string },
): Promise<ReportResult> {
  const to = p.to ?? today();
  const from = p.from ?? `${to.slice(0, 7)}-01`;
  const f = { barangay: p.barangay, species: p.species };
  const c = await periodCounts({ from, to }, f);
  const startMonth = addMonths(from.slice(0, 7), -1);
  const endMonth = to.slice(0, 7) > isoMonth() ? isoMonth() : to.slice(0, 7);
  const months: string[] = [];
  for (let m = startMonth; m <= endMonth; m = addMonths(m, 1)) months.push(m);
  const pop = await populationAt(months, f);
  const popStart = pop.get(startMonth) ?? 0;
  const popEnd = pop.get(endMonth) ?? 0;
  const targets = await targetProgress(Number(to.slice(0, 4)));
  const s = await getSettings();
  const peso = (n: number) =>
    `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rows: { section: string; indicator: string; value: string | number }[] = [];
  const add = (section: string, indicator: string, value: string | number) =>
    rows.push({ section, indicator, value });

  add('Livestock registry', `Recorded population, end of ${fmtMonth(startMonth)}`, popStart.toLocaleString());
  add('Livestock registry', `Recorded population, end of ${fmtMonth(endMonth)}`, popEnd.toLocaleString());
  add(
    'Livestock registry',
    'Change in recorded population',
    `${popEnd - popStart >= 0 ? '+' : ''}${(popEnd - popStart).toLocaleString()}`,
  );
  add('Livestock registry', 'New livestock owners registered', c.newOwners);
  add('Livestock registry', 'New farms registered', c.newFarms);
  add('Livestock registry', 'Animals given an ID / ear tag', c.animalsTagged);
  add('Livestock registry', 'Ownership transfers recorded', c.transfers);

  add('Disease surveillance', 'Disease cases reported', c.casesReported);
  for (const d of c.casesByDisease) add('Disease surveillance', `  · ${d.disease}`, d.count);
  add('Disease surveillance', 'Cases confirmed positive', c.casesPositive);
  add('Disease surveillance', 'Cases closed', c.casesClosed);
  add('Disease surveillance', 'Field investigations conducted', c.visits);
  add('Disease surveillance', 'Laboratory samples sent', c.labsSent);
  add(
    'Disease surveillance',
    'Laboratory results received',
    `${c.labPositive + c.labNegative + c.labOther} (${c.labPositive} positive, ${c.labNegative} negative${c.labOther ? `, ${c.labOther} inconclusive` : ''})`,
  );

  if (!c.measures.length) add('Disease response', 'Response measures carried out', 0);
  for (const m of c.measures)
    add('Disease response', m.label, m.heads ? `${m.count} (${m.heads.toLocaleString()} head)` : m.count);

  add('Vaccination', 'Vaccination activities', c.vaccinationEvents);
  add('Vaccination', 'Vaccine doses given', c.vaccinationDoses.toLocaleString());
  for (const v of c.vaccinationByVaccine)
    add(
      'Vaccination',
      `  · ${v.vaccine} (${v.species})`,
      `${v.doses.toLocaleString()} dose${v.doses === 1 ? '' : 's'}`,
    );
  for (const t of targets.rows)
    add(
      'Vaccination',
      `${targets.year} target — ${t.vaccine} (${t.species})`,
      `${t.given.toLocaleString()} of ${t.target.toLocaleString()} (${t.pct}%)`,
    );

  add('Stray livestock & violations', 'Stray incidents reported', c.strays);
  add('Stray livestock & violations', 'Animals impounded', c.impounded);
  add('Stray livestock & violations', 'Animals released to owners', c.released);
  add('Stray livestock & violations', 'Fines imposed', peso(c.finesImposed));
  add('Stray livestock & violations', 'Fines collected', peso(c.finesCollected));

  const scope = [p.barangay, p.species].filter(Boolean).join(' · ');
  return {
    ...base,
    subtitle: `${s.officeName} — ${s.cityName} · ${fmtDate(from)} to ${fmtDate(to)}${scope ? ` · ${scope}` : ''}`,
    columns: [
      { key: 'section', label: 'Area' },
      { key: 'indicator', label: 'Indicator' },
      { key: 'value', label: 'Accomplishment', align: 'right' },
    ],
    rows,
    summary: [
      { label: 'Cases reported', value: c.casesReported },
      { label: 'Doses given', value: c.vaccinationDoses.toLocaleString() },
      { label: 'Field investigations', value: c.visits },
      { label: 'Stray incidents', value: c.strays },
    ],
    note: 'Without dates, the report covers the current month to date. Pick dates to report any month or quarter.',
  };
}

/* ---------------- task list ("My tasks") ---------------- */

export interface Task {
  group: string;
  title: string;
  sub: string;
  href: string;
  /** Button text: what to do. */
  action: string;
  due: string | null;
  overdue: boolean;
}

/** Everything that needs doing, with a link that opens the right page (and form) to do it. */
export async function taskList(): Promise<Task[]> {
  const settings = await getSettings();
  const t = today();
  const soon = shiftDays(t, 7);
  const vaxEnd = shiftDays(t, Math.min(settings.vaccinationUpcomingDays, 14));
  const [cases, labs, visits, measures, due, farms] = await Promise.all([
    prisma.diseaseCase.findMany({
      where: { closedAt: null },
      include: { farm: true, responses: { where: { voidedAt: null, status: { not: 'PLANNED' } } } },
      orderBy: { reportedAt: 'asc' },
    }),
    prisma.labRecord.findMany({
      where: { voidedAt: null, result: 'PENDING', case: { closedAt: null } },
      include: { case: true },
      orderBy: { id: 'asc' },
    }),
    prisma.investigation.findMany({
      where: { voidedAt: null, case: { closedAt: null } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }),
    prisma.responseActivity.findMany({
      where: {
        voidedAt: null,
        case: { closedAt: null },
        OR: [
          { status: 'PLANNED', date: { lte: day(soon) } },
          { status: 'ONGOING', endDate: { lte: day(t) } },
        ],
      },
      include: { case: true },
      orderBy: { date: 'asc' },
    }),
    prisma.vaccination.findMany({
      where: { voidedAt: null, reminderDone: false, ...liveReminder, nextDate: { lte: day(vaxEnd) } },
      include: { farm: true, group: true, animal: true },
      orderBy: { nextDate: 'asc' },
    }),
    loadFarms(),
  ]);
  const latest = new Map<number, (typeof visits)[number]>();
  for (const v of visits) if (!latest.has(v.caseId)) latest.set(v.caseId, v);
  const tasks: Task[] = [];

  for (const c of cases) {
    const last = latest.get(c.id);
    const where = `${c.disease} · ${c.farm.name}, ${c.barangay}`;
    if (!last) {
      const d = ymd(c.reportedAt)!;
      tasks.push({
        group: 'Field visits',
        title: `${c.code}: first site visit`,
        sub: where,
        href: `/cases/${c.id}?tab=investigation&do=visit`,
        action: 'Record visit',
        due: d,
        overdue: d < t,
      });
    } else if (last.nextVisit && ymd(last.nextVisit)! <= soon) {
      const d = ymd(last.nextVisit)!;
      tasks.push({
        group: 'Field visits',
        title: `${c.code}: follow-up visit`,
        sub: where,
        href: `/cases/${c.id}?tab=investigation&do=visit`,
        action: 'Record visit',
        due: d,
        overdue: d < t,
      });
    }
    if (c.lat == null || c.lng == null)
      tasks.push({
        group: 'Case locations',
        title: `${c.code} has no location`,
        sub: where,
        href: `/cases/${c.id}?do=location`,
        action: 'Set location',
        due: null,
        overdue: false,
      });
  }
  for (const l of labs) {
    const sent = ymd(l.sentAt);
    const waiting = sent ? Math.round((day(t).getTime() - day(sent).getTime()) / 86400_000) : null;
    tasks.push({
      group: 'Lab results',
      title: `${l.case.code}: result for sample ${l.sampleId}`,
      sub: sent
        ? `Sent ${fmtDate(sent)} · waiting ${waiting} day${waiting === 1 ? '' : 's'}`
        : 'Not sent to the laboratory yet',
      href: `/cases/${l.caseId}?tab=laboratory`,
      action: sent ? 'Enter result' : 'Mark as sent',
      due: null,
      overdue: (waiting ?? 0) > 14,
    });
  }
  for (const m of measures) {
    const label = RESPONSE_TYPE_LABELS[m.type as ResponseType] ?? m.type;
    const planned = m.status === 'PLANNED';
    const d = ymd(planned ? m.date : m.endDate)!;
    tasks.push({
      group: 'Response measures',
      title: planned ? `${m.case.code}: ${label} planned` : `${m.case.code}: ${label} should have ended`,
      sub: `${m.case.disease} · ${m.case.barangay} — update its status`,
      href: `/cases/${m.caseId}?tab=response`,
      action: 'Update',
      due: d,
      overdue: d < t,
    });
  }
  for (const c of cases) {
    // Deaths and culled heads not yet taken off the farm's head count.
    const pending = c.deaths + sum(c.responses.map((r) => r.heads ?? 0)) - c.populationReconciled;
    if (pending > 0)
      tasks.push({
        group: 'Head counts',
        title: `${c.code}: take ${pending} dead or culled off the head count`,
        sub: `${c.farm.name} · ${CASE_STATUS_LABELS[c.status]}`,
        href: `/cases/${c.id}`,
        action: 'Update head count',
        due: null,
        overdue: false,
      });
  }
  for (const v of due) {
    const d = ymd(v.nextDate)!;
    tasks.push({
      group: 'Vaccinations due',
      title: `${v.vaccine} dose ${v.doseNumber + 1}`,
      sub: `${v.farm.name} · ${v.target === 'GROUP' ? `${v.group?.code} · ${v.count} head` : v.animal?.code}`,
      href: '/vaccinations?tab=upcoming',
      action: 'Record dose',
      due: d,
      overdue: d < t,
    });
  }
  for (const f of farms.map(summarizeFarm)) {
    if (f.recordStatus === 'overdue' || f.recordStatus === 'outdated')
      tasks.push({
        group: 'Head counts',
        title: `${f.name}: monthly head count ${f.recordStatus === 'overdue' ? 'overdue' : 'outdated'}`,
        sub: `${f.code} · ${f.barangay}`,
        href: `/population?farm=${f.id}`,
        action: 'Update count',
        due: null,
        overdue: f.recordStatus === 'outdated',
      });
    if (!f.mapped)
      tasks.push({
        group: 'Farm locations',
        title: `${f.name} is not on the map`,
        sub: `${f.code} · ${f.barangay} · ${f.ownerName}`,
        href: `/farms/${f.id}`,
        action: 'Set location',
        due: null,
        overdue: false,
      });
  }
  return tasks;
}