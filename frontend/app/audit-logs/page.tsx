"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, RefreshCw, Search, ChevronLeft, ChevronRight, ShieldCheck, CalendarDays, UserRound, Filter } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";
type AuditItem = {
  _id: string;
  actor?: { email?: string; role?: string } | null;
  employee?: { employeeCode?: string; firstName?: string; lastName?: string } | null;
  role: string;
  action: string;
  module: string;
  method: string;
  route: string;
  resourceId?: string;
  statusCode: number;
  ipAddress?: string;
  createdAt: string;
};
const MODULES = [
  ["all", "All modules"], ["employees", "Employees"], ["attendance", "Attendance"],
  ["leaves", "Leave"], ["payroll", "Payroll"], ["recruitment", "Recruitment"],
  ["approvals", "Approvals"], ["performance", "Performance"], ["auth", "Security"],
  ["expenses", "Expenses"], ["helpdesk", "IT support"], ["holidays", "Holidays"], ["shifts", "Shifts"], ["calendar", "Calendar"]
];
const pretty = (value: string) => value.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function AuditLogsContent() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [module, setModule] = useState("all");
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = sessionStorage.getItem("hrms_token") || "";
      const params = new URLSearchParams({ page: String(page), limit: "25", module });
      if (action.trim()) params.set("action", action.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`${API_URL}/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user"); window.location.href = "/login"; return;
      }
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load audit logs");
      setItems(Array.isArray(result.data) ? result.data : []);
      setPagination(result.pagination || { page: 1, limit: 25, total: 0, pages: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load audit logs");
    } finally { setLoading(false); }
  }, [page, module, action, from, to]);

  useEffect(() => { void load(); }, [load]);

  const applyFilters = () => { setAction(actionInput.trim()); setPage(1); };
  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"><ArrowLeft size={16}/>Dashboard</Link>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-lg shadow-slate-900/15"><ShieldCheck size={25}/></div>
            <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Audit Logs</h1><p className="mt-1 text-sm text-slate-500">Trace successful HRMS changes and account activity.</p></div>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Refresh</button>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total events</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{loading ? "…" : pagination.total.toLocaleString("en-IN")}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current page</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{pagination.pages ? `${pagination.page} / ${pagination.pages}` : "—"}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event coverage</p><p className="mt-2 text-sm font-semibold text-slate-900">Employees · Attendance · Leave · Payroll · Expenses</p><p className="mt-1 text-xs text-slate-500">Plus recruitment, approvals, IT support, holidays and shifts.</p></div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><Filter size={16}/>Filter activity</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select value={module} onChange={(event) => { setModule(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">{MODULES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input value={actionInput} onChange={(event) => setActionInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} placeholder="Search action…" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
          <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"/>
          <input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"/>
          <button onClick={applyFilters} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"><Search size={16}/>Apply filters</button>
        </div>
      </section>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><Activity size={17} className="text-blue-700"/><h2 className="font-bold text-slate-900">Activity history</h2></div><span className="text-xs text-slate-500">{start}–{end} of {pagination.total.toLocaleString("en-IN")}</span></div>
        {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading audit activity…</div> : items.length === 0 ? <div className="p-12 text-center"><div className="mx-auto mb-3 w-fit rounded-2xl bg-slate-100 p-3 text-slate-500"><CalendarDays size={22}/></div><p className="font-semibold text-slate-800">No activity found</p><p className="mt-1 text-sm text-slate-500">Try changing the date range or filters. New successful actions will appear here.</p></div> : <>
          <div className="divide-y divide-slate-100">
            {items.map((item) => <article key={item._id} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50/80 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{pretty(item.module)}</span><span className="text-sm font-bold text-slate-900">{pretty(item.action)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.method} {item.route}{item.resourceId ? ` · Ref: ${item.resourceId}` : ""}</p></div>
              <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{item.actor?.email || "Account unavailable"}</p><p className="mt-1 flex items-center gap-1.5 text-xs capitalize text-slate-500"><UserRound size={12}/>{item.role}{item.employee?.employeeCode ? ` · ${item.employee.employeeCode}` : ""}</p></div>
              <div className="flex items-center justify-between gap-3 md:flex-col md:items-end"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">HTTP {item.statusCode}</span><time className="text-xs tabular-nums text-slate-500">{dateTime(item.createdAt)}</time></div>
            </article>)}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><p className="text-xs text-slate-500">Showing {start}–{end} records</p><div className="flex items-center gap-2"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={17}/></button><span className="min-w-16 text-center text-xs font-semibold text-slate-600">Page {pagination.page}</span><button onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages || loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={17}/></button></div></div>
        </>}
      </section>
      <p className="mt-4 text-xs leading-5 text-slate-400">Audit records are restricted to Admin and HR. Sensitive request payloads, passwords and bank details are not stored in this activity history.</p>
    </div>
  </main>;
}

export default function AuditLogsPage() {
  return <AuthGuard><AuditLogsContent/></AuthGuard>;
}
