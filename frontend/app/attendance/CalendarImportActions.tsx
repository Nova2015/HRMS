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
    if (!/\.csv$/i.test(file.name)) { setError("Upload the Calendar CSV template in this import step. XLSX file import is not enabled yet."); return; }
    try {
      const raw = parseCsv(await file.text());
      const headers = raw.shift()?.map((v) => v.replace(/^\ufeff/, "").trim().toLowerCase()) || [];
      const required = ["category", "date", "name"];
      if (required.some((h) => !headers.includes(h))) throw new Error("Required columns: category, date, name. Download the template for the correct format.");
      const parsed: ImportRow[] = raw.map((values, index) => {
        const get = (key: string) => values[headers.indexOf(key)] || "";
        const category = get("category").toLowerCase();
        const date = get("date");
        const name = get("name");
        if (!["holiday", "event"].includes(category)) throw new Error(`Row ${index + 2}: category must be holiday or event.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error(`Row ${index + 2}: date must be YYYY-MM-DD.`);
        if (!name) throw new Error(`Row ${index + 2}: name is required.`);
        const type = get("type") || (category === "holiday" ? "public" : "company_event");
        if (category === "holiday" && !["public", "optional", "company"].includes(type)) throw new Error(`Row ${index + 2}: holiday type must be public, optional or company.`);
        if (category === "event" && !["meeting", "company_event", "training", "other"].includes(type)) throw new Error(`Row ${index + 2}: event type is invalid.`);
        const startAt = get("startat") || (category === "event" ? `${date}T09:00` : "");
        const endAt = get("endat") || (category === "event" ? `${date}T10:00` : "");
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
        <div className="flex items-start justify-between gap-3"><div><h2 id="calendar-import-title" className="text-lg font-bold text-slate-900">Import Calendar Data</h2><p className="mt-1 text-sm text-slate-500">Import Holidays and Company Events from an Excel-compatible CSV file.</p></div><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-indigo-900"><p className="font-semibold">Supported rows</p><p className="mt-1 text-xs leading-5">Holiday: date, name, type, description. Event: date, name, type, startAt, endAt, location, description, allDay. Attendance and Leave are not imported or overwritten.</p><button type="button" onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 underline"><Download size={13}/> Download import template</button></div>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:border-indigo-400 hover:bg-indigo-50/40"><Upload size={22} className="text-slate-500"/><span className="mt-2 text-sm font-semibold text-slate-800">Choose Calendar CSV file</span><span className="mt-1 text-xs text-slate-500">CSV exported or saved from Excel</span><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])}/></label>
        {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0"/>{error}</p>}
        {result && <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 size={15}/>{result}</p>}
        {rows.length > 0 && <div className="mt-4"><div className="mb-2 flex justify-between text-sm"><span className="font-semibold text-slate-800">Import preview</span><span className="text-slate-500">{rows.length} rows</span></div><div className="max-h-48 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Category</th><th className="p-2">Date</th><th className="p-2">Name</th><th className="p-2">Type</th></tr></thead><tbody>{rows.slice(0,100).map((r,i)=><tr key={i} className="border-t border-slate-100"><td className="p-2 capitalize">{r.category}</td><td className="p-2">{r.date}</td><td className="p-2">{r.name}</td><td className="p-2">{r.type}</td></tr>)}</tbody></table></div>{rows.length>100 && <p className="mt-1 text-xs text-slate-500">Previewing first 100 rows.</p>}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Close</button><button type="button" disabled={busy || !rows.length} onClick={apply} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50">{busy ? "Importing..." : "Import and Update"}</button></div>
      </section>
    </div>}
  </>;
}
