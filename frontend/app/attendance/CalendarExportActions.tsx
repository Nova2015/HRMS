"use client";

import { FileSpreadsheet, FileText } from "lucide-react";

type AttendanceRecord = {
  dateKey: string; status: string; checkIn: string | null; checkOut: string | null;
  workMinutes: number; notes?: string;
  employee?: { firstName: string; lastName: string; employeeCode: string };
};
type Holiday = { name: string; dateKey: string; type: string; description?: string };
type Leave = { startDate: string; endDate: string; leaveType: string; status: string; totalDays: number; reason: string; employee?: { firstName: string; lastName: string; employeeCode: string } };
type CompanyEvent = { title: string; eventType: string; startAt: string; endAt: string; allDay: boolean; status: string; location?: string; description?: string };
type Props = { month: Date; selectedDay: string; records: AttendanceRecord[]; holidays: Holiday[]; leaves: Leave[]; events: CompanyEvent[] };

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
type Row = string[];
const headers = ["Date", "Category", "Employee", "Employee Code", "Title / Type", "Status", "Check-in", "Check-out", "Working Time", "Location", "Description"];
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] || c));
const col = (n: number) => { let s = ""; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

function makeXlsx(rows: Row[]) {
  const enc = new TextEncoder();
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:K${rows.length}"/></worksheet>`;
  const files: [string, string][] = [
    ["[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Calendar Data" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = (x & 1) ? 0xedb88320 ^ (x >>> 1) : x >>> 1; table[n] = x >>> 0; }
  const crc = (b: Uint8Array) => { let x = 0xffffffff; for (const v of b) x = table[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const [name, source] of files) {
    const nb = enc.encode(name), data = enc.encode(source), sum = crc(data);
    const lh = new Uint8Array(30 + nb.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint32(14, sum, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nb.length, true); lh.set(nb, 30); local.push(lh, data);
    const ch = new Uint8Array(46 + nb.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint32(16, sum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, offset, true); ch.set(nb, 46); central.push(ch); offset += lh.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function CalendarExportActions({ month, selectedDay, records, holidays, leaves, events }: Props) {
  const monthStart = `${monthKey(month)}-01`;
  const monthEnd = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const rowsFor = (scope: "month" | "day"): Row[] => {
    const from = scope === "day" ? selectedDay : monthStart, to = scope === "day" ? selectedDay : monthEnd;
    const rows: Row[] = [];
    records.filter((r) => r.dateKey >= from && r.dateKey <= to).forEach((r) => rows.push([r.dateKey, "Attendance", r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "My attendance", r.employee?.employeeCode || "", r.status, r.status, timeLabel(r.checkIn), timeLabel(r.checkOut), hoursLabel(r.workMinutes || 0), "", r.notes || ""]));
    leaves.filter((l) => l.startDate <= to && l.endDate >= from).forEach((l) => rows.push([`${l.startDate} to ${l.endDate}`, "Leave", l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : "", l.employee?.employeeCode || "", l.leaveType, l.status, "", "", `${l.totalDays} day(s)`, "", l.reason || ""]));
    holidays.filter((h) => h.dateKey >= from && h.dateKey <= to).forEach((h) => rows.push([h.dateKey, "Holiday", "", "", h.name, h.type, "", "", "", "", h.description || ""]));
    events.filter((e) => dateKey(new Date(e.startAt)) <= to && dateKey(new Date(e.endAt)) >= from).forEach((e) => rows.push([dateKey(new Date(e.startAt)), e.eventType.replace("_", " "), "", "", e.title, e.status, e.allDay ? "All day" : timeLabel(e.startAt), e.allDay ? "All day" : timeLabel(e.endAt), "", e.location || "", e.description || ""]));
    return rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  };
  const exportExcel = (scope: "month" | "day") => {
    const period = scope === "day" ? selectedDay : monthKey(month);
    download(makeXlsx([headers, ...rowsFor(scope)]), `HRMS-Calendar-${period}.xlsx`);
  };
  const exportPdf = (scope: "month" | "day") => {
    const rows = rowsFor(scope), title = scope === "day" ? `HRMS Calendar - ${selectedDay}` : `HRMS Calendar - ${month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
    const win = window.open("", "_blank");
    if (!win) { window.alert("Allow pop-ups to export the calendar PDF."); return; }
    const table = [headers, ...rows].map((row, i) => `<tr>${row.map((v) => i ? `<td>${esc(v)}</td>` : `<th>${esc(v)}</th>`).join("")}</tr>`).join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:11px Arial;padding:24px;color:#172033}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#eef2ff}@page{size:landscape;margin:12mm}</style></head><body><h1>${esc(title)}</h1><p>Generated from HRMS Attendance Calendar · ${new Date().toLocaleString("en-IN")}</p><table>${table}</table><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };
  return <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"><span className="px-2 text-[10px] font-bold uppercase text-slate-500">Export</span><button type="button" onClick={() => exportExcel("month")} title="Export this month to Excel" className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-semibold text-emerald-700 shadow-sm"><FileSpreadsheet size={14}/> Excel</button><button type="button" onClick={() => exportPdf("month")} title="Export this month to PDF" className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-semibold text-rose-700 shadow-sm"><FileText size={14}/> PDF</button><button type="button" onClick={() => exportExcel("day")} className="rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-white">Day Excel</button><button type="button" onClick={() => exportPdf("day")} className="rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-white">Day PDF</button></div>;
}
