import QRCode from 'qrcode';
import { breakdownText, fmtDate, fmtMonth, titleCase } from '@livestock/shared';
import type { Letterhead } from './export';

/** Escape text for HTML. */
const h = (v: unknown) =>
  (v === null || v === undefined || v === '' ? '—' : String(v)).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );

/** QR code (PNG data URL) that opens a record in the system when scanned. */
export function recordQr(path: string) {
  return QRCode.toDataURL(`${window.location.origin}${path}`, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/**
 * Open a print window right away (browsers only allow pop-ups straight from a click), then fill it
 * once the QR code is ready and open the print dialog.
 */
async function printPage(title: string, build: () => Promise<string>, extraCss = '') {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) {
    alert('Allow pop-ups for this site to print.');
    return;
  }
  w.document.write(`<p style="font-family:Arial,sans-serif;padding:24px">Preparing ${h(title)}…</p>`);
  const body = await build();
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${h(title)}</title>
  <style>${BASE_CSS}${extraCss}</style></head><body>${body}
  <script>window.onload=()=>setTimeout(()=>window.print(),150);</script></body></html>`);
  w.document.close();
}

const BASE_CSS = `
*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:0;padding:24px;font-size:12px}
.lh{text-align:center;font-size:11px;color:#475569;line-height:1.4}.lh b{display:block;color:#166534;font-size:14px;margin-top:2px;letter-spacing:.3px}
hr{border:0;border-top:2px solid #166534;margin:10px 0 14px}
h1{font-size:18px;margin:0}h2{font-size:13px;margin:18px 0 6px;color:#166534;text-transform:uppercase;letter-spacing:.4px}
.muted{color:#64748b}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.qr{text-align:center;font-size:9.5px;color:#64748b}.qr img{width:96px;height:96px;display:block;margin:0 auto 2px}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-top:10px}.kv div{display:flex;gap:8px;border-bottom:1px dotted #cbd5e1;padding:3px 0}
.kv span{color:#64748b;min-width:118px}.stats{display:flex;gap:8px;margin-top:12px}
.stat{flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px}.stat b{display:block;font-size:16px}
table{border-collapse:collapse;width:100%;font-size:11px}th{background:#166534;color:#fff;text-align:left;padding:5px 6px}
td{border-bottom:1px solid #e2e8f0;padding:4px 6px}.empty{color:#64748b;font-style:italic;padding:6px 0}
.sign{display:flex;justify-content:space-between;gap:40px;margin-top:36px}.sign div{flex:1;text-align:center;border-top:1px solid #0f172a;padding-top:4px;font-size:11px}
.foot{margin-top:18px;font-size:10px;color:#64748b;text-align:right}
@page{size:A4;margin:12mm}@media print{body{padding:0}}
`;

function letterhead(lh: Letterhead) {
  return `<div class="lh">${h(lh.line1 ?? '')}<br/>${h(lh.line2 ?? '')}<b>${h(lh.office.toUpperCase())} — ${h(
    lh.city.toUpperCase(),
  )}</b></div><hr/>`;
}

function table(cols: string[], rows: unknown[][], empty: string) {
  if (!rows.length) return `<div class="empty">${h(empty)}</div>`;
  return `<table><thead><tr>${cols.map((c) => `<th>${h(c)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export interface FarmProfileData {
  farm: {
    id: number;
    code: string;
    name: string;
    type: string;
    barangay: string;
    zone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    pastureArea: number | null;
    pastureLocation: string | null;
    pastureLat: number | null;
    pastureLng: number | null;
    createdAt: string;
    total: number;
    tagged: number;
    recordStatusLabel: string;
    remarks: string | null;
    livestockRaised?: string;
    source?: string | null;
    lastVisitAt?: string | null;
    owner: { code: string; fullName: string; contact: string | null };
  };
  groups: {
    code: string;
    species: string;
    breed: string | null;
    sex: string;
    lifeStage: string;
    count: number;
    tagged: number;
    healthStatus: string;
    lastVerified: string | null;
    breakdown?: Record<string, number> | null;
  }[];
  vaccinations: {
    date: string;
    serviceLabel?: string;
    vaccine: string | null;
    targetLabel: string;
    count: number;
    doseNumber: number;
    nextDate: string | null;
    voided: boolean;
  }[];
  cases: {
    code: string;
    reportedAt: string;
    disease: string;
    species: string;
    statusLabel: string;
    closed: boolean;
  }[];
}

/** One-page farm profile with the office letterhead and a QR code that opens the farm's record. */
export function printFarmProfile(d: FarmProfileData, lh: Letterhead, printedBy?: string) {
  const f = d.farm;
  return printPage(`Farm Profile — ${f.code}`, async () => {
    const qr = await recordQr(`/farms/${f.id}`);
    const vax = d.vaccinations.filter((v) => !v.voided).slice(0, 10);
    return `${letterhead(lh)}
    <div class="top"><div><h1>Farm Profile</h1><div class="muted">${h(f.code)} · ${h(f.name)}</div></div>
      <div class="qr"><img src="${qr}" alt="QR code"/>Scan to open this record</div></div>
    <div class="kv">
      <div><span>Farm name</span>${h(f.name)}</div><div><span>Owner</span>${h(f.owner.fullName)} (${h(f.owner.code)})</div>
      <div><span>Farm ID</span>${h(f.code)}</div><div><span>Owner contact</span>${h(f.owner.contact)}</div>
      <div><span>Farm scale</span>${h(titleCase(f.type))}</div><div><span>Barangay / Zone</span>${h(f.barangay)}${f.zone ? ` · ${h(f.zone)}` : ''}</div>
      <div><span>Address</span>${h(f.address)}</div><div><span>Coordinates</span>${
        f.lat != null && f.lng != null ? `${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}` : 'Not geotagged'
      }</div>
      <div><span>Livestock raised</span>${h(f.livestockRaised ?? '')}</div><div><span>Last farm visit</span>${
        f.lastVisitAt ? h(fmtDate(f.lastVisitAt)) : 'No visit recorded'
      }</div>
      <div><span>Added to masterlist</span>${h(fmtDate(f.createdAt))}</div><div></div>
    </div>
    <div class="stats">
      <div class="stat">Current livestock<b>${h(f.total)}</b></div>
      <div class="stat">Species raised<b>${h(d.groups.filter((g) => g.count > 0).length)}</b></div>
      <div class="stat">Tagged animals<b>${h(f.tagged)}</b></div>
      <div class="stat">Population record<b style="font-size:13px">${h(f.recordStatusLabel)}</b></div>
    </div>
    <h2>Livestock Population</h2>
    ${table(
      ['Species', 'Breed', 'No. of Heads', 'Classification', 'Tagged', 'Health', 'Last Verified'],
      d.groups.map((g) => [
        g.species,
        g.breed,
        g.count,
        breakdownText(g.species, g.breakdown) || 'Not classified',
        g.tagged,
        g.healthStatus,
        g.lastVerified ? fmtMonth(g.lastVerified) : '—',
      ]),
      'No livestock recorded.',
    )}
    <h2>Recent Deworming &amp; Veterinary Services</h2>
    ${table(
      ['Date', 'Service', 'Species / Heads', 'Product Used', 'Next Schedule'],
      vax.map((v) => [
        fmtDate(v.date),
        v.serviceLabel ?? 'Vaccination',
        `${v.targetLabel}`,
        v.vaccine ?? '—',
        v.nextDate ? fmtDate(v.nextDate) : '—',
      ]),
      'No services recorded.',
    )}
    <h2>Disease Incidents</h2>
    ${table(
      ['Case', 'Reported', 'Disease', 'Species', 'Status'],
      d.cases.map((c) => [
        c.code,
        fmtDate(c.reportedAt),
        c.disease,
        c.species,
        `${c.statusLabel}${c.closed ? ' (closed)' : ''}`,
      ]),
      'No disease incidents on record.',
    )}
    ${f.remarks ? `<h2>Remarks</h2><div>${h(f.remarks)}</div>` : ''}
    <div class="sign"><div>Prepared by</div><div>Noted by: City Veterinarian</div></div>
    <div class="foot">Printed ${h(fmtDate(new Date()))}${printedBy ? ` by ${h(printedBy)}` : ''} · ${h(lh.office)}, ${h(lh.city)}</div>`;
  });
}

export interface OwnerCardData {
  id: number;
  code: string;
  fullName: string;
  barangay: string;
  zone: string | null;
  contact: string | null;
  rsbsa: string | null;
  registeredAt: string;
  farms: { code: string; name: string; total: number }[];
}

const CARD_CSS = `
.sheet{display:flex;gap:10mm;flex-wrap:wrap}.card{width:85.6mm;height:54mm;border:1px dashed #94a3b8;border-radius:3mm;overflow:hidden;position:relative;background:#fff}
.band{background:#166534;color:#fff;padding:2.2mm 3mm;font-size:6.6pt;line-height:1.25}.band b{display:block;font-size:8.4pt;letter-spacing:.3px}
.body{display:flex;gap:2.5mm;padding:2.5mm 3mm}.info{flex:1;min-width:0;font-size:7pt;line-height:1.45}
.name{font-size:10.5pt;font-weight:700;line-height:1.15;margin-bottom:1mm}.lbl{color:#64748b}
.cqr{width:21mm;text-align:center;font-size:5.5pt;color:#64748b}.cqr img{width:21mm;height:21mm;display:block}
.id{position:absolute;left:3mm;bottom:2.2mm;font:700 9pt/1 Inter,Arial,sans-serif;color:#166534;letter-spacing:.5px}
.back{padding:3mm;font-size:6.8pt;line-height:1.45}.back h3{margin:0 0 1mm;font-size:7.5pt;color:#166534;text-transform:uppercase}
.sig{position:absolute;left:3mm;right:3mm;bottom:3mm;display:flex;justify-content:space-between;gap:6mm}.sig div{flex:1;border-top:.3mm solid #0f172a;text-align:center;padding-top:.6mm;font-size:6pt}
.cut{margin-top:6mm;font-size:9px;color:#64748b}
`;

/** Wallet-size livestock owner ID card (front and back) with a QR code that opens the owner's record. */
export function printOwnerCard(o: OwnerCardData, lh: Letterhead) {
  return printPage(`Owner ID — ${o.code}`, async () => {
    const qr = await recordQr(`/owners/${o.id}`);
    const farms = o.farms.slice(0, 4);
    return `<style>${CARD_CSS}</style>
    <div class="sheet">
      <div class="card">
        <div class="band">${h(lh.line2 ?? '')}<b>${h(lh.office.toUpperCase())}</b>Livestock Owner Identification Card</div>
        <div class="body">
          <div class="info">
            <div class="name">${h(o.fullName)}</div>
            <div><span class="lbl">Barangay:</span> ${h(o.barangay)}${o.zone ? `, ${h(o.zone)}` : ''}</div>
            <div><span class="lbl">Contact:</span> ${h(o.contact)}</div>
            <div><span class="lbl">RSBSA No.:</span> ${h(o.rsbsa)}</div>
            <div><span class="lbl">Registered:</span> ${h(fmtDate(o.registeredAt))}</div>
          </div>
          <div class="cqr"><img src="${qr}" alt="QR code"/>Scan to verify</div>
        </div>
        <div class="id">${h(o.code)}</div>
      </div>
      <div class="card">
        <div class="back">
          <h3>Registered farms</h3>
          ${
            farms.length
              ? farms.map((f) => `<div>${h(f.code)} · ${h(f.name)} — ${h(f.total)} head</div>`).join('')
              : '<div class="lbl">No active farms.</div>'
          }
          ${o.farms.length > farms.length ? `<div class="lbl">+${o.farms.length - farms.length} more</div>` : ''}
          <div style="margin-top:1.5mm" class="lbl">This card identifies a livestock owner registered with the ${h(
            lh.office,
          )}, ${h(lh.city)}. If found, please return it to the office.</div>
        </div>
        <div class="sig"><div>Owner's signature</div><div>City Veterinarian</div></div>
      </div>
    </div>
    <div class="cut">Print at 100% scale (actual size) on card stock, then cut along the dashed lines and fold or laminate back to back.</div>`;
  });
}

/** Data for the printable monthly report (from /api/monthly-summary). */
export interface MonthlyReportData {
  month: string;
  label: string;
  barangay: string | null;
  population: {
    total: number;
    farms: number;
    owners: number;
    bySpecies: {
      species: string;
      population: number;
      farms: number;
      breakdown: Record<string, number>;
      classified: number;
    }[];
  };
  diseases: {
    reported: number;
    positive: number;
    openCases: number;
    byDisease: { name: string; count: number }[];
    cases: {
      id: number;
      code: string;
      disease: string;
      species: string;
      barangay: string;
      farmName: string | null;
      status: string;
      affected: number;
      deaths: number;
      statusLabel: string;
      reportedAt: string | null;
      closed: boolean;
    }[];
  };
  services: {
    type: string;
    label: string;
    records: number;
    head: number;
    farms: number;
    bySpecies: { species: string; head: number; farms: number }[];
  }[];
  visits: { total: number; farms: number; sickFound: number; byPurpose: { label: string; count: number }[] };
  /** End-of-month counts per species (heads). */
  perSpecies: {
    species: string;
    dewormed: number;
    pregnancyDiagnosis: number;
    pregnant: number;
    inseminated: number;
    checkups: number;
  }[];
  lab: {
    collected: number;
    surveillance: number;
    pending: number;
    positive: number;
    negative: number;
    inconclusive: number;
  };
  trend: {
    label: string;
    diseaseReports: number;
    dewormed: number;
    checkups: number;
    pregnancyDiagnosis?: number;
    inseminated?: number;
    visits: number;
  }[];
}

const MONTHLY_CSS = `
.title{text-align:center;margin:4px 0 2px;font-size:15px;font-weight:700;letter-spacing:.4px}
.period{text-align:center;color:#334155;margin-bottom:10px}
.lead{margin:4px 0 6px}.tot td{font-weight:700;background:#f1f5f9}
td.n,th.n{text-align:right}
`;

/** Standard Monthly Livestock Monitoring Report (population, disease surveillance, deworming, services, visits). */
export function printMonthlyReport(m: MonthlyReportData, lh: Letterhead, preparedBy?: string) {
  return printPage(`Monthly Report — ${m.label}`, async () => {
    const num = (v: number) => v.toLocaleString();
    const counted = ['DEWORMING', 'PREGNANCY_DIAGNOSIS', 'INSEMINATION', 'CHECKUP'];
    const other = m.services.filter((s) => !counted.includes(s.type));
    const tot = (k: 'dewormed' | 'pregnancyDiagnosis' | 'pregnant' | 'inseminated' | 'checkups') =>
      m.perSpecies.reduce((a, x) => a + x[k], 0);
    const tableN = (cols: string[], right: number[], rows: unknown[][], empty: string, total?: unknown[]) => {
      if (!rows.length) return `<div class="empty">${h(empty)}</div>`;
      const cell = (tag: string, i: number, v: unknown) =>
        `<${tag}${right.includes(i) ? ' class="n"' : ''}>${h(v)}</${tag}>`;
      return `<table><thead><tr>${cols.map((c, i) => cell('th', i, c)).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((v, i) => cell('td', i, v)).join('')}</tr>`)
        .join(
          '',
        )}${total ? `<tr class="tot">${total.map((v, i) => cell('td', i, v)).join('')}</tr>` : ''}</tbody></table>`;
    };
    return `<style>${MONTHLY_CSS}</style>${letterhead(lh)}
    <div class="title">MONTHLY LIVESTOCK MONITORING REPORT</div>
    <div class="period">For the month of <b>${h(m.label)}</b>${m.barangay ? ` · Barangay ${h(m.barangay)}` : ' · All barangays'}</div>

    <h2>I. Livestock Population</h2>
    <p class="lead">Total of <b>${num(m.population.total)}</b> head in <b>${num(m.population.farms)}</b> farms owned by <b>${num(
      m.population.owners,
    )}</b> livestock owners (current masterlist).</p>
    ${tableN(
      ['Species', 'No. of Farms', 'No. of Heads', 'Classification (Age / Sex / Stage)'],
      [1, 2],
      m.population.bySpecies
        .filter((s) => s.population > 0)
        .map((s) => [
          s.species,
          num(s.farms),
          num(s.population),
          [
            breakdownText(s.species, s.breakdown),
            s.population > s.classified ? `${num(s.population - s.classified)} not classified` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Not classified',
        ]),
      'No livestock recorded.',
      ['Total', ' ', num(m.population.total), ' '],
    )}

    <h2>II. Disease Surveillance</h2>
    <p class="lead">Disease reports received: <b>${num(m.diseases.reported)}</b> · Confirmed positive: <b>${num(
      m.diseases.positive,
    )}</b> · Open cases (all months): <b>${num(m.diseases.openCases)}</b></p>
    ${tableN(
      ['Case No.', 'Date Reported', 'Disease', 'Species', 'Barangay / Farm', 'Affected', 'Deaths', 'Status'],
      [5, 6],
      m.diseases.cases.map((c) => [
        c.code,
        c.reportedAt ? fmtDate(c.reportedAt) : '—',
        c.disease,
        c.species,
        `${c.barangay}${c.farmName ? ` · ${c.farmName}` : ''}`,
        c.affected,
        c.deaths,
        `${c.statusLabel}${c.closed ? ' (closed)' : ''}`,
      ]),
      'No disease reports this month.',
    )}

    <h2>III. Deworming, Pregnancy Diagnosis, Insemination and Check-up (per species)</h2>
    ${tableN(
      ['Species', 'Heads Dewormed', 'Pregnancy Diagnosis (pregnant)', 'Artificial Insemination', 'Check-up'],
      [1, 2, 3, 4],
      m.perSpecies.map((x) => [
        x.species,
        num(x.dewormed),
        `${num(x.pregnancyDiagnosis)} (${num(x.pregnant)})`,
        num(x.inseminated),
        num(x.checkups),
      ]),
      'No deworming, pregnancy diagnosis, insemination or check-up recorded this month.',
      m.perSpecies.length
        ? [
            'Total',
            num(tot('dewormed')),
            `${num(tot('pregnancyDiagnosis'))} (${num(tot('pregnant'))})`,
            num(tot('inseminated')),
            num(tot('checkups')),
          ]
        : undefined,
    )}

    <h2>IV. Other Veterinary Services</h2>
    ${tableN(
      ['Service', 'Records', 'No. of Farms', 'No. of Heads'],
      [1, 2, 3],
      other.filter((s) => s.records).map((s) => [s.label, num(s.records), num(s.farms), num(s.head)]),
      'No other services recorded.',
    )}

    <h2>V. Farm Visits</h2>
    <p class="lead">Farm visits conducted: <b>${num(m.visits.total)}</b> (${num(m.visits.farms)} farms) · Visits where sick animals were found: <b>${num(
      m.visits.sickFound,
    )}</b></p>
    ${tableN(
      ['Purpose of Visit', 'No. of Visits'],
      [1],
      m.visits.byPurpose.filter((p) => p.count).map((p) => [p.label, num(p.count)]),
      'No farm visits recorded this month.',
    )}

    <h2>VI. Laboratory Samples</h2>
    <p class="lead">Samples collected: <b>${num(m.lab.collected)}</b> (${num(m.lab.surveillance)} routine surveillance) · Pending: <b>${num(
      m.lab.pending,
    )}</b> · Positive: <b>${num(m.lab.positive)}</b> · Negative: <b>${num(m.lab.negative)}</b>${m.lab.inconclusive ? ` · Inconclusive: <b>${num(m.lab.inconclusive)}</b>` : ''}</p>

    <h2>VII. Six-Month Summary</h2>
    ${tableN(
      [
        'Month',
        'Disease Reports',
        'Heads Dewormed',
        'Pregnancy Diagnosis',
        'Insemination',
        'Heads Checked',
        'Farm Visits',
      ],
      [1, 2, 3, 4, 5, 6],
      m.trend.map((t) => [
        t.label,
        num(t.diseaseReports),
        num(t.dewormed),
        num(t.pregnancyDiagnosis ?? 0),
        num(t.inseminated ?? 0),
        num(t.checkups),
        num(t.visits),
      ]),
      '—',
    )}

    <div class="sign"><div>Prepared by${preparedBy ? `<br/><b>${h(preparedBy)}</b>` : ''}</div><div>Noted by<br/><b>City Veterinarian</b></div></div>
    <div class="foot">Generated ${h(fmtDate(new Date()))} · ${h(lh.office)}, ${h(lh.city)}</div>`;
  });
}

/* ---------------- Laboratory forms (RADDL) ---------------- */

export interface LabFormSample {
  sampleId: string;
  ownerName: string | null;
  farmName?: string | null;
  barangay: string | null;
  species: string | null;
  animalAge: string | null;
  animalSex: string | null;
  condition: string | null;
  hoursSinceDeath: number | null;
  sampleType: string | null;
  organs: string | null;
  collectedAt: string | null;
  lat: number | null;
  lng: number | null;
}
export interface LabFormData {
  code: string;
  purposeLabel: string;
  examination: string;
  laboratory: string;
  submittedAt: string | null;
  submittedBy: string | null;
  notedBy: string | null;
  requestId: string | null;
  accessionNo: string | null;
  remarks: string | null;
  samples: LabFormSample[];
}

/** Species as named on the Analysis Request Form. */
const FORM_SPECIES: [string, string[]][] = [
  ['Bovine', ['Cattle']],
  ['Bubaline', ['Carabao']],
  ['Swine', ['Swine']],
  ['Caprine', ['Goat']],
  ['Ovine', ['Sheep']],
  ['Avian', ['Chicken', 'Duck', 'Other Poultry']],
  ['Others', ['Other']],
];
const FORM_PURPOSES = [
  'Diagnostics',
  'Disease Investigation',
  'Surveillance',
  'Local Shipment',
  'Regulatory',
  'Farm Accreditation',
  'Others',
];
const box = (on: boolean) => (on ? '&#9745;' : '&#9744;');
const province = (lh: Letterhead) => lh.address?.split(',').pop()?.trim() || 'Camarines Sur';

const LAB_CSS = `
.form h1{text-align:center;font-size:16px;letter-spacing:.5px;margin:4px 0 2px}.form .to{text-align:center;color:#475569;font-size:11px;margin-bottom:10px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}.line{display:flex;gap:6px;border-bottom:1px solid #94a3b8;padding:4px 0;min-height:22px}
.line span{color:#475569;white-space:nowrap}.sec{margin-top:12px;border:1px solid #64748b}.sec .t{background:#e2e8f0;font-weight:700;padding:3px 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px}
.sec .b{padding:6px 8px;display:flex;flex-wrap:wrap;gap:4px 18px}.sec .b div{min-width:150px}
table.grid{font-size:10px}table.grid th{background:#e2e8f0;color:#0f172a;border:1px solid #64748b;padding:3px 4px;text-align:center}
table.grid td{border:1px solid #94a3b8;padding:3px 4px;vertical-align:top}table.grid td.c{text-align:center}
.sig3{display:flex;justify-content:space-between;gap:28px;margin-top:28px}.sig3 div{flex:1;text-align:center;font-size:10.5px}
.sig3 b{display:block;border-top:1px solid #0f172a;padding-top:3px;margin-top:26px;font-weight:600}
`;

function labSenderBlock(lh: Letterhead) {
  return `<div class="grid2">
    <div class="line"><span>Submitted by:</span>${h(`${lh.office}, ${lh.city}`)}</div>
    <div class="line"><span>Address:</span>${h(lh.address || `${lh.city}, ${province(lh)}`)}</div>
    <div class="line"><span>Contact No.:</span>${lh.contact ? h(lh.contact) : ''}</div>
    <div class="line"><span>Email:</span>${lh.email ? h(lh.email) : ''}</div>
  </div>`;
}

/**
 * The Analysis Request Form (General Sample), filled in from a laboratory submission. The sample
 * list itself is the Laboratory Sample Collection Form.
 */
export function printAnalysisRequest(d: LabFormData, lh: Letterhead, printedBy?: string) {
  const xs = d.samples;
  const count = (f: (x: LabFormSample) => boolean) => xs.filter(f).length;
  const dates = xs
    .map((x) => x.collectedAt)
    .filter(Boolean)
    .sort() as string[];
  const collected = dates.length
    ? dates[0] === dates[dates.length - 1]
      ? fmtDate(dates[0])
      : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`
    : '';
  const owners = [
    ...new Set(xs.map((x) => [x.ownerName, x.farmName].filter(Boolean).join(' — ')).filter(Boolean)),
  ];
  const brgys = [...new Set(xs.map((x) => x.barangay).filter(Boolean))];
  const ages = [...new Set(xs.map((x) => x.animalAge).filter(Boolean))];
  const dead = xs.filter((x) => x.condition === 'DEAD');
  const hours = dead.map((x) => x.hoursSinceDeath).filter((x) => x != null) as number[];
  const spec = (name: string) => count((x) => (x.sampleType ?? '') === name);
  const organs = [...new Set(xs.flatMap((x) => (x.organs ? x.organs.split(/,\s*/) : [])))];
  const purpose = FORM_PURPOSES.includes(d.purposeLabel) ? d.purposeLabel : 'Others';
  return printPage(
    `Analysis Request — ${d.code}`,
    async () => `${letterhead(lh)}<div class="form">
    <h1>ANALYSIS REQUEST FORM (GENERAL SAMPLE)</h1>
    <div class="to">To: ${h(d.laboratory)} · Reference ${h(d.code)}</div>
    <div class="grid2">
      <div class="line"><span>Request ID:</span>${d.requestId ? h(d.requestId) : ''}</div>
      <div class="line"><span>Date submitted:</span>${d.submittedAt ? h(fmtDate(d.submittedAt)) : ''}</div>
      <div class="line"><span>Laboratory accession no.:</span>${d.accessionNo ? h(d.accessionNo) : ''}</div>
      <div class="line"><span>Time:</span></div>
      <div class="line"><span>Document type:</span>${box(true)} Hard copy &nbsp; ${box(false)} E-copy</div>
      <div class="line"><span>Date collected:</span>${h(collected)}</div>
    </div>
    ${labSenderBlock(lh)}
    <div class="sec"><div class="t">Origin of samples</div><div class="b">
      <div style="flex:1 1 100%"><b>Owner / Farm:</b> ${owners.length === 1 ? h(owners[0]) : `Various farms (${owners.length}) — see the Sample Collection Form`}</div>
      <div><b>Barangay:</b> ${brgys.length === 1 ? h(brgys[0]) : `Various barangays (${h(brgys.join(', '))})`}</div>
      <div><b>Municipality / City:</b> ${h(lh.city)}</div>
      <div><b>Province:</b> ${h(province(lh))}</div>
    </div></div>
    <div class="sec"><div class="t">Specimen / quantity submitted</div><div class="b">
      ${FORM_SPECIES.map(([label, sp]) => {
        const n = count((x) => sp.includes(x.species ?? ''));
        return `<div>${box(n > 0)} ${label}${n ? ` <b>${n}</b>` : ''}</div>`;
      }).join('')}
    </div><div class="b">
      <div><b>Sex:</b> ${box(count((x) => x.animalSex === 'M') > 0)} Male ${count((x) => x.animalSex === 'M') || ''} &nbsp; ${box(count((x) => x.animalSex === 'F') > 0)} Female ${count((x) => x.animalSex === 'F') || ''}</div>
      <div><b>Age:</b> ${h(ages.join(', ') || '')}</div>
      <div>${box(count((x) => x.condition === 'LIVE') > 0)} Live ${count((x) => x.condition === 'LIVE') || ''}</div>
      <div>${box(dead.length > 0)} Dead / sacrificed ${dead.length || ''}${hours.length ? ` (hours since death: ${Math.min(...hours)}${Math.max(...hours) !== Math.min(...hours) ? `–${Math.max(...hours)}` : ''})` : ''}</div>
    </div><div class="b">
      <div><b>Specimen:</b></div>
      ${['Whole animal', 'Blood', 'Serum', 'Swab', 'Blood smear', 'Feces', 'Tissue / Organs', 'Other']
        .map(
          (t) =>
            `<div>${box(spec(t) > 0)} ${t === 'Other' ? 'Others' : h(t)}${spec(t) ? ` <b>${spec(t)}</b>` : ''}${t === 'Tissue / Organs' && organs.length ? ` (${h(organs.join(', '))})` : ''}</div>`,
        )
        .join('')}
    </div></div>
    <div class="sec"><div class="t">Examination requested</div><div class="b"><div>${box(true)} <b>${h(d.examination)}</b></div></div></div>
    <div class="sec"><div class="t">Purpose</div><div class="b">
      ${FORM_PURPOSES.map((p) => `<div>${box(p === purpose)} ${h(p)}${p === 'Others' && purpose === 'Others' ? `: ${h(d.purposeLabel)}` : ''}</div>`).join('')}
    </div></div>
    ${d.remarks ? `<div class="sec"><div class="t">Remarks</div><div class="b"><div>${h(d.remarks)}</div></div></div>` : ''}
    <div class="sig3">
      <div><b>${h(d.submittedBy || '')}</b>Submitted by (name &amp; signature)</div>
      <div><b>${h(d.notedBy || '')}</b>Noted by</div>
      <div><b>&nbsp;</b>Received by (laboratory)</div>
    </div>
    <div class="foot">${xs.length} sample(s) · Printed ${h(fmtDate(new Date()))}${printedBy ? ` by ${h(printedBy)}` : ''} · ${h(lh.office)}, ${h(lh.city)}</div>
    </div>`,
    LAB_CSS,
  );
}

/** The Laboratory Sample Collection Form: one row per sample (owner, address, species, specimen, GPS). */
export function printSampleCollection(d: LabFormData, lh: Letterhead, printedBy?: string) {
  const cols = ['Fecal', 'Blood', 'Serum', 'Tissue/ Organs', 'Others'];
  const colOf = (t: string | null) =>
    t === 'Feces' ? 0 : t === 'Blood' ? 1 : t === 'Serum' ? 2 : t === 'Tissue / Organs' ? 3 : 4;
  return printPage(
    `Sample Collection Form — ${d.code}`,
    async () => `${letterhead(lh)}<div class="form">
    <h1>LABORATORY SAMPLE COLLECTION FORM</h1>
    <div class="to">For ${h(d.laboratory)} · Reference ${h(d.code)} · ${h(d.examination)}</div>
    <div class="grid2">
      <div class="line"><span>Date / time of submission:</span>${d.submittedAt ? h(fmtDate(d.submittedAt)) : ''}</div>
      <div class="line"><span>Laboratory accession number:</span>${d.accessionNo ? h(d.accessionNo) : ''}</div>
      <div class="line"><span>Purpose:</span>${h(d.purposeLabel)}</div>
      <div class="line"><span>Sample received by:</span></div>
    </div>
    <table class="grid" style="margin-top:10px"><thead>
      <tr><th rowspan="2">No.</th><th rowspan="2">Sample ID</th><th rowspan="2">Name of owner</th><th rowspan="2">Address (Barangay / City / Province)</th>
      <th rowspan="2">Date / time of collection</th><th rowspan="2">Species</th><th rowspan="2">Age</th><th rowspan="2">Sex</th>
      <th colspan="5">Sample collected</th><th rowspan="2" style="width:150px">Remarks (signature of the owner / barangay captain &amp; GPS location)</th></tr>
      <tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>
    </thead><tbody>
      ${d.samples
        .map(
          (x, i) => `<tr><td class="c">${i + 1}</td><td>${h(x.sampleId)}</td><td>${h(x.ownerName)}</td>
          <td>${h(x.barangay)}, ${h(lh.city)}, ${h(province(lh))}</td><td>${h(fmtDate(x.collectedAt))}</td>
          <td>${h(x.species)}</td><td class="c">${h(x.animalAge)}</td><td class="c">${h(x.animalSex)}</td>
          ${cols.map((_, k) => `<td class="c">${colOf(x.sampleType) === k ? (k === 3 && x.organs ? `&#10003; ${h(x.organs)}` : k === 4 ? `&#10003; ${h(x.sampleType)}` : '&#10003;') : ''}</td>`).join('')}
          <td>${x.lat != null && x.lng != null ? `${x.lat.toFixed(4)}, ${x.lng.toFixed(4)}` : ''}${x.condition === 'DEAD' ? `<br/>Dead${x.hoursSinceDeath != null ? ` (${x.hoursSinceDeath} h)` : ''}` : ''}</td></tr>`,
        )
        .join('')}
    </tbody></table>
    <div class="muted" style="margin-top:4px;font-size:10px">*Purpose: Diagnosis, Disease Investigation, Local Shipment, Surveillance, Farm Accreditation &amp; others</div>
    <div class="sig3">
      <div><b>${h(d.submittedBy || '')}</b>Submitted by (name &amp; signature)</div>
      <div><b>${h(d.notedBy || '')}</b>Noted by</div>
      <div><b>&nbsp;</b>Certified by (MAO / MA / PVO / CVO / MVO)</div>
    </div>
    <div class="foot">${d.samples.length} sample(s) · Printed ${h(fmtDate(new Date()))}${printedBy ? ` by ${h(printedBy)}` : ''} · ${h(lh.office)}, ${h(lh.city)}</div>
    </div>`,
    `${LAB_CSS}@page{size:A4 landscape;margin:10mm}`,
  );
}
