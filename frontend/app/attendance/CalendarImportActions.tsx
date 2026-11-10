"use client";

import { useRef, useState } from "react";
import { FileUp, Download, X, Upload, AlertCircle, CheckCircle2 } from "lucide-react";

type ImportRow = { category: "holiday" | "event"; date: string; name: string; type: string; description: string; startAt: string; endAt: string; location: string; allDay: boolean };
type Props = { onImport: (rows: ImportRow[]) => Promise<{ created: number; updated: number; skipped: number }> };

const template = "category,date,name,type,description,startAt,endAt,location,allDay\r\nholiday,2026-01-26,Republic Day,public,National holiday,,,,true\r\nevent,2026-01-27,Team Meeting,meeting,Monthly team meeting,2026-01-27T10:00,2026-01-27T11:00,Conference Room,false\r\n";
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); if (row.some((v) => v)) rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell.trim()); if (row.some((v) => v)) rows.push(row);
  return rows;
}
async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), decoder = new TextDecoder("utf-8");
  let eocd = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Invalid XLSX workbook: ZIP directory was not found.");
  const entries = new Map<string, { method: number; compressedSize: number; localOffset: number }>();
  const count = view.getUint16(eocd + 10, true); let cursor = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Invalid XLSX ZIP entry.");
    const method = view.getUint16(cursor + 10, true), compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, "/");
    entries.set(name, { method, compressedSize, localOffset }); cursor += 46 + nameLength + extraLength + commentLength;
  }
  const readEntry = async (name: string): Promise<string> => {
    const entry = entries.get(name); if (!entry) throw new Error(`XLSX workbook is missing ${name}.`);
    const offset = entry.localOffset; if (view.getUint32(offset, true) !== 0x04034b50) throw new Error("Invalid XLSX file entry.");
    const nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength, compressed = bytes.slice(start, start + entry.compressedSize);
    if (entry.method === 0) return decoder.decode(compressed);
    if (entry.method !== 8 || typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress this XLSX workbook. Save it as CSV and import again.");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
    return decoder.decode(await new Response(stream).arrayBuffer());
  };
  const workbook = new DOMParser().parseFromString(await readEntry("xl/workbook.xml"), "application/xml");
  const rels = new DOMParser().parseFromString(await readEntry("xl/_rels/workbook.xml.rels"), "application/xml");
  const sheet = workbook.getElementsByTagName("sheet")[0]; if (!sheet) throw new Error("The XLSX workbook has no worksheet.");
  const relationId = sheet.getAttribute("r:id");
  const relation = Array.from(rels.getElementsByTagName("Relationship")).find((item) => item.getAttribute("Id") === relationId);
  const target = relation?.getAttribute("Target"); if (!target) throw new Error("Could not locate the first worksheet.");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sharedXml = entries.has("xl/sharedStrings.xml") ? await readEntry("xl/sharedStrings.xml") : "";
  const sharedDoc = sharedXml ? new DOMParser().parseFromString(sharedXml, "application/xml") : null;
  const shared = sharedDoc ? Array.from(sharedDoc.getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join("")) : [];
  const sheetDoc = new DOMParser().parseFromString(await readEntry(sheetPath), "application/xml");
  const cellRows = Array.from(sheetDoc.getElementsByTagName("sheetData")[0]?.getElementsByTagName("row") || []);
  const columnIndex = (reference: string) => {
    const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    return Array.from(letters).reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
  };
  return cellRows.map((row) => {
    const values: string[] = [];
    Array.from(row.children).filter((cell) => cell.tagName === "c").forEach((cell) => {
      const index = columnIndex(cell.getAttribute("r") || "A1"), type = cell.getAttribute("t");
      let value = "";
      if (type === "inlineStr") value = Array.from(cell.getElementsByTagName("t")).map((t) => t.textContent || "").join("");
      else { const raw = cell.getElementsByTagName("v")[0]?.textContent || ""; value = type === "s" ? (shared[Number(raw)] ?? "") : raw; }
      values[index] = value;
    });
    return values.map((value) => value ?? "");
  });
}
function normalizeExcelDate(value: string, withTime = false): string {
  if (!/^\\d+(?:\\.\\d+)?$/.test(value)) return value;
  const milliseconds = Date.UTC(1899, 11, 30) + Number(value) * 86400000;
  const date = new Date(milliseconds);
  const day = date.toISOString().slice(0, 10);
  return withTime ? `${day}T${date.toISOString().slice(11, 16)}` : day;
}
function downloadTemplate() {
  const blob = new Blob(["\ufeff", template], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "HRMS-Calendar-Import-Template.csv"; a.click(); URL.revokeObjectURL(url);
}

export default function CalendarImportActions({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const readFile = async (file?: File) => {
    setError(""); setResult(""); setRows([]);
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError("Choose an .xlsx workbook or .csv file."); return; }
    try {
      const raw = /\.xlsx$/i.test(file.name) ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
      const headers = raw.shift()?.map((v) => v.replace(/^\ufeff/, "").trim().toLowerCase()) || [];
      const required = ["category", "date", "name"];
      if (required.some((h) => !headers.includes(h))) throw new Error("Required columns: category, date, name. Download the template for the correct format.");
      const parsed: ImportRow[] = raw.map((values, index) => {
        const get = (key: string) => values[headers.indexOf(key)] || "";
        const category = get("category").toLowerCase();
        const date = normalizeExcelDate(get("date"));
        const name = get("name");
        if (!["holiday", "event"].includes(category)) throw new Error(`Row ${index + 2}: category must be holiday or event.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error(`Row ${index + 2}: date must be YYYY-MM-DD.`);
        if (!name) throw new Error(`Row ${index + 2}: name is required.`);
        const type = get("type") || (category === "holiday" ? "public" : "company_event");
        if (category === "holiday" && !["public", "optional", "company"].includes(type)) throw new Error(`Row ${index + 2}: holiday type must be public, optional or company.`);
        if (category === "event" && !["meeting", "company_event", "training", "other"].includes(type)) throw new Error(`Row ${index + 2}: event type is invalid.`);
        const startAt = normalizeExcelDate(get("startat"), true) || (category === "event" ? `${date}T09:00` : "");
        const endAt = normalizeExcelDate(get("endat"), true) || (category === "event" ? `${date}T10:00` : "");
        if (category === "event" && (!Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt)) || Date.parse(endAt) <= Date.parse(startAt))) throw new Error(`Row ${index + 2}: event endAt must be after startAt.`);
        return { category: category as ImportRow["category"], date, name, type, description: get("description"), startAt, endAt, location: get("location"), allDay: ["true","yes","1"].includes(get("allday").toLowerCase()) };
      });
      if (!parsed.length) throw new Error("No import rows found in this CSV.");
      setRows(parsed);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read CSV file."); }
  };
  const apply = async () => {
    setBusy(true); setError("");
    try {
      const summary = await onImport(rows);
      setResult(`Import complete: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped.`);
      setRows([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "Calendar import failed."); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" onClick={() => { setOpen(true); setError(""); setResult(""); }} className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"><FileUp size={14}/> Import</button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="calendar-import-title" className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/60 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="calendar-import-title" className="text-lg font-bold text-slate-900">Import Calendar Data</h2><p className="mt-1 text-sm text-slate-500">Import Holidays and Company Events directly from an Excel (.xlsx) workbook or CSV file.</p></div><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-indigo-900"><p className="font-semibold">Supported rows</p><p className="mt-1 text-xs leading-5">Holiday: date, name, type, description. Event: date, name, type, startAt, endAt, location, description, allDay. Attendance and Leave are not imported or overwritten.</p><button type="button" onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 underline"><Download size={13}/> Download import template</button></div>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:border-indigo-400 hover:bg-indigo-50/40"><Upload size={22} className="text-slate-500"/><span className="mt-2 text-sm font-semibold text-slate-800">Choose Calendar Excel or CSV file</span><span className="mt-1 text-xs text-slate-500">Supported formats: .xlsx and .csv</span><input ref={inputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])}/></label>
        {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0"/>{error}</p>}
        {result && <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 size={15}/>{result}</p>}
        {rows.length > 0 && <div className="mt-4"><div className="mb-2 flex justify-between text-sm"><span className="font-semibold text-slate-800">Import preview</span><span className="text-slate-500">{rows.length} rows</span></div><div className="max-h-48 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Category</th><th className="p-2">Date</th><th className="p-2">Name</th><th className="p-2">Type</th></tr></thead><tbody>{rows.slice(0,100).map((r,i)=><tr key={i} className="border-t border-slate-100"><td className="p-2 capitalize">{r.category}</td><td className="p-2">{r.date}</td><td className="p-2">{r.name}</td><td className="p-2">{r.type}</td></tr>)}</tbody></table></div>{rows.length>100 && <p className="mt-1 text-xs text-slate-500">Previewing first 100 rows.</p>}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Close</button><button type="button" disabled={busy || !rows.length} onClick={apply} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50">{busy ? "Importing..." : "Import and Update"}</button></div>
      </section>
    </div>}
  </>;
}
