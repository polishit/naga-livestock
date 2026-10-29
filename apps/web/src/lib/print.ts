import QRCode from 'qrcode';
import { fmtDate, fmtMonth, titleCase } from '@livestock/shared';
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
async function printPage(title: string, build: () => Promise<string>) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) {
    alert('Allow pop-ups for this site to print.');
    return;
  }
  w.document.write(`<p style="font-family:Arial,sans-serif;padding:24px">Preparing ${h(title)}…</p>`);
  const body = await build();
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${h(title)}</title>
  <style>${BASE_CSS}</style></head><body>${body}
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
  }[];
  vaccinations: {
    date: string;
    vaccine: string;
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
      <div><span>Farm type</span>${h(titleCase(f.type))}</div><div><span>Barangay / Zone</span>${h(f.barangay)}${f.zone ? ` · ${h(f.zone)}` : ''}</div>
      <div><span>Address</span>${h(f.address)}</div><div><span>Coordinates</span>${
        f.lat != null && f.lng != null ? `${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}` : 'Not geotagged'
      }</div>
      <div><span>Registered</span>${h(fmtDate(f.createdAt))}</div><div></div>
      ${
        // Pasture rows only for farms whose animals graze on a pasture.
        f.pastureArea != null || f.pastureLocation || f.pastureLat != null
          ? `<div><span>Pasture area</span>${f.pastureArea != null ? `${h(f.pastureArea)} ha` : '—'}</div><div><span>Pasture location</span>${h(f.pastureLocation ?? '')}${
              f.pastureLat != null && f.pastureLng != null
                ? `${f.pastureLocation ? ' · ' : ''}${f.pastureLat.toFixed(6)}, ${f.pastureLng.toFixed(6)}`
                : ''
            }</div>`
          : ''
      }
    </div>
    <div class="stats">
      <div class="stat">Current livestock<b>${h(f.total)}</b></div>
      <div class="stat">Population groups<b>${h(d.groups.length)}</b></div>
      <div class="stat">Tagged animals<b>${h(f.tagged)}</b></div>
      <div class="stat">Population record<b style="font-size:13px">${h(f.recordStatusLabel)}</b></div>
    </div>
    <h2>Population groups</h2>
    ${table(
      ['Group', 'Species', 'Breed', 'Sex', 'Life stage', 'Head', 'Tagged', 'Health', 'Last verified'],
      d.groups.map((g) => [
        g.code,
        g.species,
        g.breed,
        g.sex,
        titleCase(g.lifeStage),
        g.count,
        g.tagged,
        g.healthStatus,
        g.lastVerified ? fmtMonth(g.lastVerified) : '—',
      ]),
      'No population groups.',
    )}
    <h2>Recent vaccinations</h2>
    ${table(
      ['Date', 'Vaccine', 'Target', 'Head', 'Dose', 'Next schedule'],
      vax.map((v) => [
        fmtDate(v.date),
        v.vaccine,
        v.targetLabel,
        v.count,
        v.doseNumber,
        v.nextDate ? fmtDate(v.nextDate) : '—',
      ]),
      'No vaccinations recorded.',
    )}
    <h2>Disease incidents</h2>
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