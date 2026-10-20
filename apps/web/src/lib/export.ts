import type { ReportResult } from '@livestock/shared';

export interface Letterhead {
  line1?: string | null;
  line2?: string | null;
  office: string;
  city: string;
}

const safeName = (s: string) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function toCsv(r: ReportResult): string {
  const esc = (v: unknown) => {
    const s = cell(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    esc(r.title),
    esc(r.subtitle),
    '',
    r.columns.map((c) => esc(c.label)).join(','),
    ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(',')),
    '',
    ...r.summary.map((s) => `${esc(s.label)},${esc(s.value)}`),
  ];
  if (r.note) lines.push('', esc(r.note));
  return '﻿' + lines.join('\r\n');
}

export function exportCsv(r: ReportResult) {
  download(new Blob([toCsv(r)], { type: 'text/csv;charset=utf-8' }), `${safeName(r.title)}.csv`);
}

export async function exportXlsx(r: ReportResult, lh: Letterhead) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = lh.office;
  const ws = wb.addWorksheet(r.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  const width = Math.max(r.columns.length, 2);
  const heading = [lh.line1, lh.line2, `${lh.office} — ${lh.city}`].filter(Boolean) as string[];
  heading.forEach((h, i) => {
    ws.addRow([h]);
    ws.mergeCells(i + 1, 1, i + 1, width);
    ws.getRow(i + 1).font = { bold: i === heading.length - 1, size: i === heading.length - 1 ? 12 : 10 };
    ws.getRow(i + 1).alignment = { horizontal: 'center' };
  });
  ws.addRow([]);
  const t = ws.addRow([r.title]);
  t.font = { bold: true, size: 13 };
  ws.addRow([r.subtitle]).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const head = ws.addRow(r.columns.map((c) => c.label));
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
  });
  for (const row of r.rows) ws.addRow(r.columns.map((c) => row[c.key] ?? ''));
  ws.addRow([]);
  for (const s of r.summary) ws.addRow([s.label, s.value]).font = { bold: true };
  if (r.note) ws.addRow([r.note]).font = { italic: true, size: 9 };
  r.columns.forEach((c, i) => {
    const longest = Math.max(c.label.length, ...r.rows.map((row) => cell(row[c.key]).length));
    ws.getColumn(i + 1).width = Math.min(48, Math.max(10, longest + 2));
  });
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeName(r.title)}.xlsx`,
  );
}

export async function exportPdf(r: ReportResult, lh: Letterhead) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const landscape = r.columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  // Letterhead
  doc.setFillColor(122, 173, 105);
  doc.rect(0, 0, W, 6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  let y = 30;
  for (const l of [lh.line1, lh.line2].filter(Boolean) as string[]) {
    doc.text(l, W / 2, y, { align: 'center' });
    y += 12;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(22, 101, 52);
  doc.text(`${lh.office.toUpperCase()} — ${lh.city.toUpperCase()}`, W / 2, y + 2, { align: 'center' });
  y += 12;
  doc.setDrawColor(203, 213, 225);
  doc.line(40, y, W - 40, y);
  y += 22;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(r.title, 40, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(r.subtitle.replace(/—/g, '-'), 40, y);
  const clean = (v: unknown) =>
    cell(v).replace(/≈/g, '~').replace(/→/g, '->').replace(/—/g, '-').replace(/₱/g, 'PHP ');
  autoTable(doc, {
    startY: y + 10,
    head: [r.columns.map((c) => c.label)],
    body: r.rows.map((row) => r.columns.map((c) => clean(row[c.key]))),
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [22, 101, 52], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated ${new Date().toLocaleString()} · Page ${doc.getNumberOfPages()}`, 40, H - 20);
    },
  });
  let fy = (doc as any).lastAutoTable.finalY + 18;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  for (const s of r.summary) {
    doc.text(`${s.label}: ${clean(s.value)}`, 40, fy);
    fy += 13;
  }
  if (r.note) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(clean(r.note), 40, fy + 4);
  }
  doc.save(`${safeName(r.title)}.pdf`);
}

const html = (s: unknown) =>
  cell(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export function printReport(r: ReportResult, lh: Letterhead) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${html(r.title)}</title>
  <style>body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:32px}h1{font-size:18px;margin:16px 0 2px}.sub{color:#64748b;font-size:12px}
  .lh{text-align:center;font-size:11px;color:#475569}.lh b{display:block;color:#166534;font-size:14px;margin-top:2px}
  table{border-collapse:collapse;width:100%;margin-top:14px;font-size:11.5px}th{background:#166534;color:#fff;text-align:left;padding:6px}
  td{border-bottom:1px solid #e2e8f0;padding:5px 6px}.sum{margin-top:12px;font-size:12px}.sum span{display:inline-block;background:#f1f5f9;border-radius:4px;padding:3px 8px;margin:0 6px 6px 0}
  .note{color:#64748b;font-size:11px;margin-top:8px}@page{margin:14mm}</style></head><body>
  <div class="lh">${html(lh.line1 ?? '')}<br/>${html(lh.line2 ?? '')}<b>${html(lh.office.toUpperCase())} — ${html(lh.city.toUpperCase())}</b></div><hr/>
  <h1>${html(r.title)}</h1><div class="sub">${html(r.subtitle)}</div>
  <table><thead><tr>${r.columns.map((c) => `<th>${html(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${r.rows.map((row) => `<tr>${r.columns.map((c) => `<td>${html(row[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <div class="sum">${r.summary.map((s) => `<span>${html(s.label)}: <b>${html(s.value)}</b></span>`).join('')}</div>
  ${r.note ? `<div class="note">${html(r.note)}</div>` : ''}
  <script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}
