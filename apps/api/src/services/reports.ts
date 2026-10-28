import {
  CASE_OUTCOME_LABELS,
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  INVESTIGATION_VISIT_LABELS,
  REPORT_TYPES,
  RESPONSE_STATUS_LABELS,
  RESPONSE_TYPE_LABELS,
  fmtDate,
  fmtDateTime,
  fmtMonth,
  formatRadius,
  isoDate,
  titleCase,
  type ReportColumn,
  type ReportResult,
  type CaseOutcome,
  type InvestigationVisitType,
  type ResponseStatus,
  type ResponseType,
} from '@livestock/shared';
import { prisma } from '../db';
import { dateOnly, today, ymd } from '../lib/dates';
import { HttpError } from '../lib/http';
import {
  loadCases,
  loadFarms,
  populationTotals,
  radiusAnalysis,
  summarizeFarm,
  vaccinationCoverage,
} from './metrics';
import { getSettings } from './settings';
import { OVERDUE_DAYS, liveReminder } from '../routes/vaccinations';

export interface ReportParams {
  barangay?: string;
  species?: string;
  from?: string;
  to?: string;
}

const col = (key: string, label: string, align?: 'right'): ReportColumn => ({ key, label, align });

function inRange(d: Date | null | undefined, p: ReportParams) {
  if (!d) return !p.from && !p.to;
  const s = ymd(d)!;
  if (p.from && s < p.from) return false;
  if (p.to && s > p.to) return false;
  return true;
}

async function subtitle(p: ReportParams) {
  const s = await getSettings();
  const to = p.to ?? today();
  // Without a start date the report covers every record up to the end date.
  const period = p.from ? `${fmtDate(p.from)} to ${fmtDate(to)}` : `All records as of ${fmtDate(to)}`;
  const scope = [p.barangay, p.species].filter(Boolean).join(' · ');
  return `${s.officeName} — ${s.cityName} · ${period}${scope ? ` · ${scope}` : ''}`;
}

export async function buildReport(id: string, p: ReportParams): Promise<ReportResult> {
  const def = REPORT_TYPES.find((r) => r.id === id);
  if (!def || id === 'outbreak-area') throw new HttpError(404, 'Unknown report type');
  const base = { id, title: def.title, subtitle: await subtitle(p) };

  switch (id) {
    case 'population-by-barangay': {
      const t = populationTotals(await loadFarms(p));
      return {
        ...base,
        columns: [
          col('barangay', 'Barangay'),
          col('farms', 'Farms'),
          col('population', 'Current recorded population'),
        ],
        rows: t.byBarangay.map((b) => ({ barangay: b.barangay, farms: b.farms, population: b.population })),
        summary: [
          { label: 'Total population', value: t.total.toLocaleString() },
          { label: 'Farms', value: (await loadFarms(p)).length },
        ],
      };
    }
    case 'population-by-species': {
      const t = populationTotals(await loadFarms(p));
      return {
        ...base,
        columns: [
          col('species', 'Species'),
          col('groups', 'Groups'),
          col('tagged', 'Tagged (within count)'),
          col('population', 'Current population'),
        ],
        rows: t.bySpecies.map((s) => ({
          species: s.species,
          groups: s.groups,
          tagged: s.tagged,
          population: s.population,
        })),
        summary: [{ label: 'Total population', value: t.total.toLocaleString() }],
        note: 'Tagged animals are members of their groups and are not added again.',
      };
    }
    case 'population-by-farm': {
      const rows = (await loadFarms(p)).map(summarizeFarm);
      return {
        ...base,
        columns: [
          col('code', 'Farm ID'),
          col('name', 'Farm'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('type', 'Type'),
          col('species', 'Species'),
          col('total', 'Total'),
          col('status', 'Population record'),
        ],
        rows: rows.map((r) => ({
          code: r.code,
          name: r.name,
          owner: r.ownerName,
          barangay: r.barangay,
          type: titleCase(r.type),
          species: r.species.map((s) => `${s.species} ${s.count}`).join(', '),
          total: r.total,
          status: r.recordStatusLabel,
        })),
        summary: [
          { label: 'Farms', value: rows.length },
          { label: 'Total population', value: rows.reduce((a, r) => a + r.total, 0).toLocaleString() },
        ],
      };
    }
    case 'population-by-owner': {
      const farms = (await loadFarms(p)).map(summarizeFarm);
      const byOwner = new Map<
        number,
        { owner: string; barangay: string; farms: number; total: number; tagged: number }
      >();
      for (const f of farms) {
        const o = byOwner.get(f.ownerId) ?? {
          owner: f.ownerName,
          barangay: f.barangay,
          farms: 0,
          total: 0,
          tagged: 0,
        };
        o.farms += 1;
        o.total += f.total;
        o.tagged += f.tagged;
        byOwner.set(f.ownerId, o);
      }
      const owners = await prisma.owner.findMany({ where: { id: { in: [...byOwner.keys()] } } });
      return {
        ...base,
        columns: [
          col('code', 'Owner ID'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('farms', 'Farms'),
          col('tagged', 'Tagged'),
          col('total', 'Livestock'),
        ],
        rows: [...byOwner.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([oid, o]) => ({ code: owners.find((x) => x.id === oid)?.code ?? '', ...o })),
        summary: [{ label: 'Owners', value: byOwner.size }],
      };
    }
    case 'population-groups': {
      const farms = await loadFarms(p);
      const rows = farms.flatMap((f) =>
        f.groups.map((g) => ({
          code: g.code,
          farm: f.name,
          owner: f.owner.fullName,
          barangay: f.barangay,
          species: g.species,
          breed: g.breed ?? '—',
          count: g.count,
          tagged: g.animals.length,
          lastVerified: fmtMonth(g.lastVerified),
        })),
      );
      return {
        ...base,
        columns: [
          col('code', 'Group'),
          col('farm', 'Farm'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('species', 'Species'),
          col('breed', 'Breed'),
          col('count', 'Count'),
          col('tagged', 'Tagged'),
          col('lastVerified', 'Last verified'),
        ],
        rows,
        summary: [
          { label: 'Groups', value: rows.length },
          { label: 'Head', value: rows.reduce((a, r) => a + r.count, 0).toLocaleString() },
        ],
      };
    }
    case 'population-updates': {
      const updates = await prisma.populationUpdate.findMany({
        where: {
          group: {
            ...(p.species ? { species: p.species } : {}),
            farm: { archived: false, ...(p.barangay ? { barangay: p.barangay } : {}) },
          },
          ...(p.from || p.to
            ? {
                month: {
                  ...(p.from ? { gte: p.from.slice(0, 7) } : {}),
                  ...(p.to ? { lte: p.to.slice(0, 7) } : {}),
                },
              }
            : {}),
        },
        include: { group: { include: { farm: true } } },
        orderBy: [{ month: 'desc' }, { id: 'desc' }],
      });
      return {
        ...base,
        columns: [
          col('month', 'Month'),
          col('group', 'Group'),
          col('farm', 'Farm'),
          col('species', 'Species'),
          col('previous', 'Previous'),
          col('count', 'Count'),
          col('change', 'Change'),
          col('state', 'Entry'),
          col('by', 'Recorded by'),
        ],
        rows: updates.map((u) => ({
          month: fmtMonth(u.month),
          group: u.group.code,
          farm: u.group.farm.name,
          species: u.group.species,
          previous: u.previous ?? '—',
          count: u.count,
          change: u.change > 0 ? `+${u.change}` : String(u.change),
          state: u.superseded ? 'Superseded' : 'Current',
          by: u.createdBy ?? '—',
        })),
        summary: [{ label: 'Entries', value: updates.length }],
        note: 'Superseded entries are kept for audit and never added again.',
      };
    }
    case 'population-overdue': {
      const rows = (await loadFarms(p))
        .map(summarizeFarm)
        .filter((r) => r.recordStatus === 'overdue' || r.recordStatus === 'outdated');
      return {
        ...base,
        columns: [
          col('code', 'Farm ID'),
          col('name', 'Farm'),
          col('owner', 'Owner'),
          col('contact', 'Contact'),
          col('barangay', 'Barangay'),
          col('total', 'Head'),
          col('status', 'Status'),
        ],
        rows: rows.map((r) => ({
          code: r.code,
          name: r.name,
          owner: r.ownerName,
          contact: r.ownerContact ?? '—',
          barangay: r.barangay,
          total: r.total,
          status: r.recordStatusLabel,
        })),
        summary: [
          { label: 'Overdue', value: rows.filter((r) => r.recordStatus === 'overdue').length },
          { label: 'Outdated', value: rows.filter((r) => r.recordStatus === 'outdated').length },
        ],
      };
    }
    case 'disease-cases': {
      const cases = (await loadCases(p)).filter((c) => inRange(c.reportedAt, p)).sort((a, b) => a.id - b.id);
      return {
        ...base,
        columns: [
          col('code', 'Case'),
          col('reported', 'Reported'),
          col('disease', 'Disease'),
          col('species', 'Species'),
          col('farm', 'Farm'),
          col('barangay', 'Barangay'),
          col('affected', 'Affected'),
          col('deaths', 'Deaths'),
          col('status', 'Status'),
          col('outcome', 'Outcome'),
          col('location', 'Location'),
        ],
        rows: cases.map((c) => ({
          code: c.code,
          reported: fmtDate(ymd(c.reportedAt)),
          disease: c.disease,
          species: c.species,
          farm: c.farm.name,
          barangay: c.barangay,
          affected: c.affected,
          deaths: c.deaths,
          status: CASE_STATUS_LABELS[c.status],
          outcome: c.closedAt
            ? `Closed — ${CASE_OUTCOME_LABELS[c.closureOutcome as CaseOutcome]?.split(' — ')[0] ?? 'closed'}`
            : 'Open',
          location: c.lat != null ? 'Mapped' : 'Awaiting geotag',
        })),
        summary: [
          { label: 'Cases', value: cases.length },
          { label: 'Positive', value: cases.filter((c) => c.status === 'POSITIVE').length },
          { label: 'Awaiting geotagging', value: cases.filter((c) => c.lat == null).length },
          { label: 'Affected', value: cases.reduce((a, c) => a + c.affected, 0) },
          { label: 'Deaths', value: cases.reduce((a, c) => a + c.deaths, 0) },
        ],
      };
    }
    case 'cases-by-status': {
      const cases = (await loadCases(p)).filter((c) => inRange(c.reportedAt, p));
      return {
        ...base,
        columns: [
          col('status', 'Status'),
          col('cases', 'Cases'),
          col('affected', 'Affected'),
          col('deaths', 'Deaths'),
        ],
        rows: CASE_STATUSES.map((s) => {
          const x = cases.filter((c) => c.status === s);
          return {
            status: CASE_STATUS_LABELS[s],
            cases: x.length,
            affected: x.reduce((a, c) => a + c.affected, 0),
            deaths: x.reduce((a, c) => a + c.deaths, 0),
          };
        }),
        summary: [{ label: 'Cases', value: cases.length }],
      };
    }
    case 'cases-by-disease':
    case 'cases-by-barangay': {
      const key = id === 'cases-by-disease' ? 'disease' : 'barangay';
      const cases = (await loadCases(p)).filter((c) => inRange(c.reportedAt, p));
      const m = new Map<string, { cases: number; positive: number; affected: number; deaths: number }>();
      for (const c of cases) {
        const k = (c as any)[key] as string;
        const r = m.get(k) ?? { cases: 0, positive: 0, affected: 0, deaths: 0 };
        r.cases += 1;
        r.positive += c.status === 'POSITIVE' ? 1 : 0;
        r.affected += c.affected;
        r.deaths += c.deaths;
        m.set(k, r);
      }
      return {
        ...base,
        columns: [
          col(key, key === 'disease' ? 'Suspected disease' : 'Barangay'),
          col('cases', 'Cases'),
          col('positive', 'Positive'),
          col('affected', 'Affected'),
          col('deaths', 'Deaths'),
        ],
        rows: [...m.entries()].sort((a, b) => b[1].cases - a[1].cases).map(([k, v]) => ({ [key]: k, ...v })),
        summary: [{ label: 'Cases', value: cases.length }],
      };
    }
    case 'lab-results': {
      const labs = await prisma.labRecord.findMany({
        where: {
          voidedAt: null,
          case: {
            ...(p.barangay ? { barangay: p.barangay } : {}),
            ...(p.species ? { species: p.species } : {}),
          },
        },
        include: { case: true },
        orderBy: { id: 'asc' },
      });
      const rows = labs.filter((l) => inRange(l.sentAt ?? l.createdAt, p));
      return {
        ...base,
        columns: [
          col('sampleId', 'Sample ID'),
          col('case', 'Case'),
          col('disease', 'Disease'),
          col('type', 'Type'),
          col('test', 'Test'),
          col('laboratory', 'Laboratory'),
          col('sent', 'Sent'),
          col('result', 'Result'),
          col('resultDate', 'Result date'),
        ],
        rows: rows.map((l) => ({
          sampleId: l.sampleId,
          case: l.case.code,
          disease: l.case.disease,
          type: `${l.sampleType ?? '—'}${l.sampleCount ? ` ×${l.sampleCount}` : ''}`,
          test: l.testMethod ?? '—',
          laboratory: l.laboratory ?? '—',
          sent: fmtDate(ymd(l.sentAt)),
          result: titleCase(l.result),
          resultDate: fmtDate(ymd(l.resultDate)),
        })),
        summary: [
          { label: 'Samples', value: rows.length },
          { label: 'Pending', value: rows.filter((l) => l.result === 'PENDING').length },
          { label: 'Positive', value: rows.filter((l) => l.result === 'POSITIVE').length },
        ],
      };
    }
    case 'investigations': {
      const inv = await prisma.investigation.findMany({
        where: {
          voidedAt: null,
          case: {
            ...(p.barangay ? { barangay: p.barangay } : {}),
            ...(p.species ? { species: p.species } : {}),
          },
        },
        include: { case: true },
        orderBy: { date: 'desc' },
      });
      const rows = inv.filter((i) => inRange(i.date, p));
      return {
        ...base,
        columns: [
          col('date', 'Date'),
          col('case', 'Case'),
          col('visit', 'Visit'),
          col('investigator', 'Investigator'),
          col('animals', 'Examined / sick / dead'),
          col('notes', 'Findings'),
          col('next', 'Next visit'),
        ],
        rows: rows.map((i) => ({
          date: fmtDate(ymd(i.date)),
          case: i.case.code,
          visit: INVESTIGATION_VISIT_LABELS[i.visitType as InvestigationVisitType] ?? i.visitType,
          investigator: i.investigator ?? '—',
          animals: `${i.animalsExamined ?? '—'} / ${i.sickCount ?? '—'} / ${i.deadCount ?? '—'}`,
          notes: i.notes,
          next: fmtDate(ymd(i.nextVisit)),
        })),
        summary: [{ label: 'Investigations', value: rows.length }],
      };
    }
    case 'cases-awaiting-geotag': {
      const cases = (await loadCases(p)).filter((c) => c.lat == null || c.lng == null);
      return {
        ...base,
        columns: [
          col('code', 'Case'),
          col('reported', 'Reported'),
          col('disease', 'Disease'),
          col('farm', 'Farm'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('status', 'Status'),
        ],
        rows: cases.map((c) => ({
          code: c.code,
          reported: fmtDate(ymd(c.reportedAt)),
          disease: c.disease,
          farm: c.farm.name,
          owner: c.owner.fullName,
          barangay: c.barangay,
          status: CASE_STATUS_LABELS[c.status],
        })),
        summary: [{ label: 'Awaiting geotagging', value: cases.length }],
        note: 'These cases are excluded from radius analysis until a location is set.',
      };
    }
    case 'response-activities': {
      const acts = await prisma.responseActivity.findMany({
        where: {
          voidedAt: null,
          case: {
            ...(p.barangay ? { barangay: p.barangay } : {}),
            ...(p.species ? { species: p.species } : {}),
          },
        },
        include: { case: true },
        orderBy: { date: 'desc' },
      });
      const rows = acts.filter((a) => inRange(a.date, p));
      return {
        ...base,
        columns: [
          col('date', 'Date'),
          col('case', 'Case'),
          col('disease', 'Disease'),
          col('type', 'Activity'),
          col('status', 'Status'),
          col('until', 'Until'),
          col('personnel', 'Personnel'),
          col('remarks', 'Remarks'),
        ],
        rows: rows.map((a) => ({
          date: fmtDate(ymd(a.date)),
          case: a.case.code,
          disease: a.case.disease,
          type: `${RESPONSE_TYPE_LABELS[a.type as ResponseType] ?? a.type}${a.heads ? ` (${a.heads} culled)` : ''}`,
          status: RESPONSE_STATUS_LABELS[a.status as ResponseStatus] ?? a.status,
          until: fmtDate(ymd(a.endDate)),
          personnel: a.personnel ?? '—',
          remarks: a.remarks ?? '—',
        })),
        summary: [{ label: 'Activities', value: rows.length }],
        note: 'Documentation only — not automated recommendations.',
      };
    }
    case 'vaccination-records': {
      const v = await prisma.vaccination.findMany({
        where: {
          voidedAt: null,
          ...(p.species ? { species: p.species } : {}),
          ...(p.barangay ? { farm: { barangay: p.barangay } } : {}),
        },
        include: { farm: true },
        orderBy: { id: 'asc' },
      });
      const rows = v.filter((x) => inRange(x.date, p));
      return {
        ...base,
        columns: [
          col('code', 'Record'),
          col('date', 'Date'),
          col('vaccine', 'Vaccine'),
          col('species', 'Species'),
          col('farm', 'Farm'),
          col('target', 'Target'),
          col('doses', 'Doses'),
          col('dose', 'Dose #'),
        ],
        rows: rows.map((x) => ({
          code: x.code,
          date: fmtDate(ymd(x.date)),
          vaccine: x.vaccine,
          species: x.species,
          farm: x.farm.name,
          target: x.target === 'GROUP' ? 'Group' : 'Animal',
          doses: x.count,
          dose: x.doseNumber,
        })),
        summary: [
          { label: 'Vaccination events', value: rows.length },
          { label: 'Doses administered', value: rows.reduce((a, x) => a + x.count, 0) },
        ],
        note: '* Doses are raw totals and may include repeat doses to the same animals.',
      };
    }
    case 'vaccination-coverage': {
      const c = await vaccinationCoverage(p);
      return {
        ...base,
        subtitle: await subtitle({ ...p, from: c.from, to: c.to }),
        columns: [
          col('species', 'Species'),
          col('population', 'Population'),
          col('estimated', 'Estimated coverage'),
          col('tagged', 'Tagged'),
          col('exact', 'Exact coverage (tagged)'),
          col('events', 'Events'),
          col('doses', 'Doses'),
        ],
        rows: c.rows.map((r) => ({
          species: r.species,
          population: r.population,
          estimated: `≈ ${r.estimatedPct}% (${r.estimatedHeads} of ${r.population})`,
          tagged: r.tagged,
          exact: r.exactPct == null ? '—' : `${r.exactPct}% (${r.exactVaccinated} of ${r.tagged})`,
          events: r.events,
          doses: r.doses,
        })),
        summary: [{ label: 'Overall estimated coverage', value: `≈ ${c.overallPct}%` }],
        note: 'Estimated coverage is based on aggregate vaccination events; exact applies to tagged animals only.',
      };
    }
    case 'vaccination-upcoming': {
      const settings = await getSettings();
      // Without a start date the schedule also lists doses missed in the last 30 days (overdue).
      const start = p.from ?? isoDate(new Date(Date.now() - OVERDUE_DAYS * 86400_000));
      const endD = new Date(`${p.from ?? today()}T00:00:00Z`);
      endD.setUTCDate(endD.getUTCDate() + settings.vaccinationUpcomingDays);
      const end = p.to ?? isoDate(new Date(endD.getTime() + endD.getTimezoneOffset() * 60000));
      const v = await prisma.vaccination.findMany({
        where: {
          voidedAt: null,
          reminderDone: false,
          nextDate: { gte: dateOnly(start), lte: dateOnly(end) },
          ...liveReminder,
          ...(p.species ? { species: p.species } : {}),
          ...(p.barangay ? { farm: { archived: false, barangay: p.barangay } } : {}),
        },
        include: { farm: { include: { owner: true } }, group: true, animal: true },
        orderBy: { nextDate: 'asc' },
      });
      return {
        ...base,
        subtitle: await subtitle({ ...p, from: start, to: end }),
        columns: [
          col('next', 'Due'),
          col('vaccine', 'Vaccine'),
          col('species', 'Species'),
          col('target', 'Target'),
          col('farm', 'Farm'),
          col('owner', 'Owner'),
          col('contact', 'Contact'),
          col('dose', 'Next dose #'),
        ],
        rows: v.map((x) => ({
          next: `${fmtDate(ymd(x.nextDate))}${ymd(x.nextDate)! < today() ? ' (overdue)' : ''}`,
          vaccine: x.vaccine,
          species: x.species,
          target:
            x.target === 'GROUP' ? `Group ${x.group?.code} · ${x.count} head` : `Animal ${x.animal?.code}`,
          farm: x.farm.name,
          owner: x.farm.owner.fullName,
          contact: x.farm.owner.contact ?? '—',
          dose: x.doseNumber + 1,
        })),
        summary: [
          { label: 'Scheduled', value: v.length },
          { label: 'Overdue', value: v.filter((x) => ymd(x.nextDate)! < today()).length },
        ],
      };
    }
    case 'vaccination-by-barangay': {
      const v = await prisma.vaccination.findMany({
        where: { voidedAt: null, ...(p.species ? { species: p.species } : {}) },
        include: { farm: true },
      });
      const rows = v.filter((x) => inRange(x.date, p) && (!p.barangay || x.farm.barangay === p.barangay));
      const m = new Map<string, { events: number; doses: number; farms: Set<number> }>();
      for (const x of rows) {
        const r = m.get(x.farm.barangay) ?? { events: 0, doses: 0, farms: new Set<number>() };
        r.events += 1;
        r.doses += x.count;
        r.farms.add(x.farmId);
        m.set(x.farm.barangay, r);
      }
      return {
        ...base,
        columns: [
          col('barangay', 'Barangay'),
          col('farms', 'Farms served'),
          col('events', 'Events'),
          col('doses', 'Doses'),
        ],
        rows: [...m.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([b, r]) => ({ barangay: b, farms: r.farms.size, events: r.events, doses: r.doses })),
        summary: [
          { label: 'Events', value: rows.length },
          { label: 'Doses', value: rows.reduce((a, x) => a + x.count, 0) },
        ],
      };
    }
    case 'owner-registry': {
      const owners = await prisma.owner.findMany({
        where: { status: { not: 'ARCHIVED' }, ...(p.barangay ? { barangay: p.barangay } : {}) },
        orderBy: { id: 'asc' },
      });
      return {
        ...base,
        columns: [
          col('code', 'Owner ID'),
          col('name', 'Name'),
          col('barangay', 'Barangay'),
          col('zone', 'Zone'),
          col('contact', 'Contact'),
          col('cert', 'RSBSA No.'),
          col('registered', 'Registered'),
        ],
        rows: owners.map((o) => ({
          code: o.code,
          name: o.fullName,
          barangay: o.barangay,
          zone: o.zone ?? '—',
          contact: o.contact ?? '—',
          cert: o.rsbsa ?? '—',
          registered: fmtDate(o.registeredAt),
        })),
        summary: [{ label: 'Owners', value: owners.length }],
      };
    }
    case 'farm-registry': {
      const rows = (await loadFarms(p)).map(summarizeFarm);
      return {
        ...base,
        columns: [
          col('code', 'Farm ID'),
          col('name', 'Farm'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('type', 'Type'),
          col('total', 'Head'),
          col('lat', 'Latitude'),
          col('lng', 'Longitude'),
        ],
        rows: rows.map((r) => ({
          code: r.code,
          name: r.name,
          owner: r.ownerName,
          barangay: r.barangay,
          type: titleCase(r.type),
          total: r.total,
          lat: r.lat ?? '—',
          lng: r.lng ?? '—',
        })),
        summary: [
          { label: 'Farms', value: rows.length },
          { label: 'Mapped', value: rows.filter((r) => r.mapped).length },
        ],
      };
    }
    case 'animal-registry': {
      const animals = await prisma.animal.findMany({
        where: {
          ...(p.species ? { species: p.species } : {}),
          ...(p.barangay ? { group: { farm: { barangay: p.barangay } } } : {}),
        },
        include: { group: { include: { farm: { include: { owner: true } } } } },
        orderBy: { id: 'asc' },
      });
      return {
        ...base,
        columns: [
          col('code', 'Animal ID'),
          col('tag', 'Ear tag'),
          col('species', 'Species'),
          col('sex', 'Sex'),
          col('owner', 'Owner'),
          col('farm', 'Farm'),
          col('status', 'Status'),
        ],
        rows: animals.map((a) => ({
          code: a.code,
          tag: a.earTag ?? '—',
          species: a.species,
          sex: a.sex,
          owner: a.group.farm.owner.fullName,
          farm: a.group.farm.name,
          status: titleCase(a.status),
        })),
        summary: [{ label: 'Animals', value: animals.length }],
      };
    }
    case 'ownership-transfers': {
      const farmNames = new Map(
        (await prisma.farm.findMany({ select: { id: true, name: true } })).map((f) => [f.id, f.name]),
      );
      const t = await prisma.ownershipTransfer.findMany({
        include: { animal: true, fromOwner: true, toOwner: true },
        orderBy: { date: 'desc' },
      });
      const rows = t.filter((x) => inRange(x.date, p) && (!p.species || x.animal.species === p.species));
      return {
        ...base,
        columns: [
          col('code', 'Record'),
          col('date', 'Date'),
          col('animal', 'Animal'),
          col('from', 'From'),
          col('to', 'To'),
          col('type', 'Type'),
          col('remarks', 'Remarks'),
        ],
        rows: rows.map((x) => ({
          code: x.code,
          date: fmtDate(ymd(x.date)),
          animal: x.animal.code,
          from: `${x.fromOwner.fullName} · ${farmNames.get(x.fromFarmId)}`,
          to: `${x.toOwner.fullName} · ${farmNames.get(x.toFarmId)}`,
          type: titleCase(x.type),
          remarks: x.remarks ?? '—',
        })),
        summary: [{ label: 'Transfers', value: rows.length }],
      };
    }
    case 'stray-incidents': {
      const s = await prisma.strayIncident.findMany({
        where: {
          ...(p.barangay ? { barangay: p.barangay } : {}),
          ...(p.species ? { species: p.species } : {}),
        },
        include: { owner: true },
        orderBy: { discoveredAt: 'desc' },
      });
      const rows = s.filter((x) => inRange(x.discoveredAt, p));
      const fined = rows.filter((x) => x.fineAmount != null && Number(x.fineAmount) > 0);
      const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      return {
        ...base,
        columns: [
          col('code', 'Incident'),
          col('discovered', 'Discovered'),
          col('species', 'Species'),
          col('tag', 'Tag'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('violation', 'Violation'),
          col('impound', 'Impounded'),
          col('release', 'Released'),
          col('fine', 'Fine'),
          col('status', 'Status'),
        ],
        rows: rows.map((x) => ({
          code: x.code,
          discovered: fmtDateTime(x.discoveredAt),
          species: x.species,
          tag: x.earTag ?? '—',
          owner: x.owner?.fullName ?? 'Unknown',
          barangay: `${x.barangay} — ${x.location}`,
          violation: `${x.violationType ?? '—'}${x.violations ? ` (${x.violations})` : ''}`,
          impound: x.impoundedAt ? `${fmtDate(ymd(x.impoundedAt))} · ${x.impoundPlace ?? ''}` : '—',
          release: x.releasedAt ? `${fmtDate(ymd(x.releasedAt))} · to ${x.releasedTo ?? ''}` : '—',
          fine:
            x.fineAmount != null && Number(x.fineAmount) > 0
              ? `${peso(Number(x.fineAmount))} · ${x.finePaid ? `Paid, OR ${x.orNumber}` : 'Unpaid'}`
              : '—',
          status: titleCase(x.status),
        })),
        summary: [
          { label: 'Incidents', value: rows.length },
          { label: 'Violations', value: rows.reduce((a, x) => a + x.violations, 0) },
          { label: 'Impounded', value: rows.filter((x) => x.impoundedAt).length },
          {
            label: 'Fines collected',
            value: peso(fined.filter((x) => x.finePaid).reduce((a, x) => a + Number(x.fineAmount), 0)),
          },
          {
            label: 'Fines unpaid',
            value: peso(fined.filter((x) => !x.finePaid).reduce((a, x) => a + Number(x.fineAmount), 0)),
          },
        ],
      };
    }
    case 'pcic-policies': {
      const pol = await prisma.pcicPolicy.findMany({
        where: {
          ...(p.species ? { species: p.species } : {}),
          ...(p.barangay ? { owner: { barangay: p.barangay } } : {}),
          // With a period chosen, the policies whose coverage overlaps it.
          ...(p.to ? { startDate: { lte: dateOnly(p.to) } } : {}),
          ...(p.from ? { endDate: { gte: dateOnly(p.from) } } : {}),
        },
        include: { owner: true, animals: { select: { code: true, earTag: true }, orderBy: { id: 'asc' } } },
        orderBy: { startDate: 'desc' },
      });
      const status = (x: (typeof pol)[number]) =>
        x.status === 'ACTIVE' && ymd(x.endDate)! < today() ? 'EXPIRED' : x.status;
      return {
        ...base,
        columns: [
          col('policy', 'Policy No.'),
          col('owner', 'Owner'),
          col('barangay', 'Barangay'),
          col('species', 'Species'),
          col('heads', 'Heads'),
          col('animals', 'Insured animals (ear tags)'),
          col('amount', 'Amount covered'),
          col('period', 'Coverage period'),
          col('status', 'Status'),
        ],
        rows: pol.map((x) => ({
          policy: x.policyNo,
          owner: x.owner.fullName,
          barangay: x.owner.barangay,
          species: x.species,
          heads: x.heads,
          animals: x.animals.length ? x.animals.map((a) => a.earTag ?? a.code).join(', ') : 'Not linked',
          amount: x.amountCovered ? `₱${Number(x.amountCovered).toLocaleString()}` : '—',
          period: `${fmtDate(ymd(x.startDate))} – ${fmtDate(ymd(x.endDate))}`,
          status: titleCase(status(x)),
        })),
        summary: [
          { label: 'Policies', value: pol.length },
          { label: 'In force', value: pol.filter((x) => status(x) === 'ACTIVE').length },
          { label: 'Insured heads', value: pol.reduce((a, x) => a + x.heads, 0) },
          { label: 'Tagged animals linked', value: pol.reduce((a, x) => a + x.animals.length, 0) },
        ],
      };
    }
    case 'rsbsa-registration': {
      const owners = await prisma.owner.findMany({
        where: { status: { not: 'ARCHIVED' }, ...(p.barangay ? { barangay: p.barangay } : {}) },
        select: { barangay: true, rsbsa: true },
      });
      const by = new Map<string, { owners: number; registered: number }>();
      for (const o of owners) {
        const b = by.get(o.barangay) ?? { owners: 0, registered: 0 };
        b.owners += 1;
        if (o.rsbsa) b.registered += 1;
        by.set(o.barangay, b);
      }
      const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
      const registered = owners.filter((o) => o.rsbsa).length;
      return {
        ...base,
        columns: [
          col('barangay', 'Barangay'),
          col('owners', 'Owners', 'right'),
          col('registered', 'With RSBSA No.', 'right'),
          col('unregistered', 'Without RSBSA No.', 'right'),
          col('pct', 'Registered', 'right'),
        ],
        rows: [...by.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([barangay, b]) => ({
            barangay,
            owners: b.owners,
            registered: b.registered,
            unregistered: b.owners - b.registered,
            pct: pct(b.registered, b.owners),
          })),
        summary: [
          { label: 'Owners', value: owners.length },
          { label: 'With RSBSA No.', value: registered },
          { label: 'Without RSBSA No.', value: owners.length - registered },
          { label: 'Registered', value: pct(registered, owners.length) },
        ],
        note: 'The owners without an RSBSA number are listed by name in the Incomplete Records report.',
      };
    }
    case 'incomplete-records': {
      const rows: Record<string, string>[] = [];
      const owners = await prisma.owner.findMany({
        where: { status: { not: 'ARCHIVED' }, ...(p.barangay ? { barangay: p.barangay } : {}) },
        orderBy: { id: 'asc' },
      });
      for (const o of owners) {
        const missing = [!o.contact && 'contact number', !o.rsbsa && 'RSBSA number'].filter(Boolean);
        if (missing.length)
          rows.push({
            type: 'Owner',
            code: o.code,
            name: o.fullName,
            barangay: o.barangay,
            missing: missing.join(', '),
          });
      }
      const farms = await prisma.farm.findMany({
        where: {
          archived: false,
          owner: { status: { not: 'ARCHIVED' } },
          ...(p.barangay ? { barangay: p.barangay } : {}),
        },
        include: { owner: true },
        orderBy: { id: 'asc' },
      });
      for (const f of farms) {
        const missing = [
          (f.lat == null || f.lng == null) && 'map location',
          f.type === 'pasture' && f.pastureArea == null && 'pasture area',
          f.pastureArea != null &&
            f.pastureArea > 0 &&
            f.pastureLat == null &&
            !f.pastureLocation &&
            'pasture location',
        ].filter(Boolean);
        if (missing.length)
          rows.push({
            type: 'Farm',
            code: f.code,
            name: `${f.name} (${f.owner.fullName})`,
            barangay: f.barangay,
            missing: missing.join(', '),
          });
      }
      const animals = await prisma.animal.findMany({
        where: {
          status: 'ACTIVE',
          group: {
            archived: false,
            farm: { archived: false, ...(p.barangay ? { barangay: p.barangay } : {}) },
          },
          ...(p.species ? { species: p.species } : {}),
        },
        include: { group: { include: { farm: { include: { owner: true } } } } },
        orderBy: { id: 'asc' },
      });
      for (const a of animals) {
        const photos = (a.photoKeys as string[] | null) ?? [];
        const missing = [
          !photos.length && 'photo',
          !a.markings && !a.cowlick && 'markings / cowlick',
          !a.earTag && 'ear tag',
        ].filter(Boolean);
        if (missing.length)
          rows.push({
            type: 'Animal',
            code: a.code,
            name: `${a.species} · ${a.group.farm.owner.fullName}`,
            barangay: a.group.farm.barangay,
            missing: missing.join(', '),
          });
      }
      const count = (t: string) => rows.filter((r) => r.type === t).length;
      return {
        ...base,
        // A snapshot of today's records: the date range does not apply.
        subtitle: await subtitle({ barangay: p.barangay, species: p.species }),
        columns: [
          col('type', 'Record'),
          col('code', 'ID'),
          col('name', 'Name'),
          col('barangay', 'Barangay'),
          col('missing', 'Missing information'),
        ],
        rows,
        summary: [
          { label: 'Owners', value: count('Owner') },
          { label: 'Farms', value: count('Farm') },
          { label: 'Tagged animals', value: count('Animal') },
        ],
        note: 'Records still in use (not archived) that lack details needed for tracing and identification.',
      };
    }
    case 'farms-without-coordinates': {
      const rows = (await loadFarms(p)).map(summarizeFarm).filter((r) => !r.mapped);
      return {
        ...base,
        columns: [
          col('code', 'Farm ID'),
          col('name', 'Farm'),
          col('owner', 'Owner'),
          col('contact', 'Contact'),
          col('barangay', 'Barangay'),
          col('total', 'Head'),
        ],
        rows: rows.map((r) => ({
          code: r.code,
          name: r.name,
          owner: r.ownerName,
          contact: r.ownerContact ?? '—',
          barangay: r.barangay,
          total: r.total,
        })),
        summary: [{ label: 'Farms without coordinates', value: rows.length }],
        note: 'These farms are excluded from radius analysis until geotagged.',
      };
    }
  }
  throw new HttpError(404, 'Unknown report type');
}

/** Outbreak-area report around a geocoded case. */
export async function buildOutbreakReport(
  caseId: number,
  radius?: number,
): Promise<ReportResult & { map: unknown }> {
  const r = await radiusAnalysis(caseId, radius);
  if (!r) throw new HttpError(404, 'Case not found');
  if (!r.geocoded) throw new HttpError(400, 'This case has no location yet. Geotag it first.');
  const c = r.case;
  return {
    id: 'outbreak-area',
    title: `Outbreak-Area Report — ${c.code}`,
    subtitle: await subtitle({ from: ymd(c.reportedAt)! }),
    columns: [
      col('code', 'Farm ID'),
      col('name', 'Farm'),
      col('role', 'Role'),
      col('owner', 'Owner'),
      col('contact', 'Contact'),
      col('barangay', 'Barangay'),
      col('total', 'Livestock'),
      col('distance', 'Distance'),
      col('lat', 'Latitude'),
      col('lng', 'Longitude'),
    ],
    rows: r.farms.map((f) => ({
      code: f.code,
      name: f.name,
      role: f.role,
      owner: f.ownerName,
      contact: f.ownerContact ?? '—',
      barangay: f.barangay,
      total: f.total,
      distance: `${f.distance} m`,
      lat: f.lat,
      lng: f.lng,
    })),
    summary: [
      { label: 'Ground zero', value: `${c.code} (${c.lat}, ${c.lng})` },
      { label: 'Disease', value: c.disease },
      { label: 'Radius', value: formatRadius(r.radius) },
      { label: 'Farms within radius (total)', value: r.totals!.farms },
      { label: 'Ground-zero farm', value: r.totals!.groundZero },
      { label: 'Additional nearby farms', value: r.totals!.nearby },
      { label: 'Livestock within radius', value: r.totals!.livestock },
      { label: 'Owners', value: r.totals!.owners },
      { label: 'Excluded (no coordinates)', value: r.excluded },
    ],
    map: { center: r.center, radius: r.radius, farms: r.farms },
  };
}