"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, CalendarDays, Download, RefreshCw, Users, Clock3, Wallet, ClipboardCheck } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
type ReportData = {
  range: { from: string; to: string };
  employees: { active: number; total: number; inactive: number };
  attendance: { present: number; "half-day": number; absent: number; late: number; workMinutes: number };
  leave: { pending: number; approved: number; rejected: number; cancelled: number; totalRequests: number; totalDays: number };
  payroll: { processedRecords: number; paidRecords: number; processedNetPay: number; paidNetPay: number; grossPay: number };
  performance: { pending: number; selfSubmitted: number; managerReviewed: number; finalized: number; averageRating: number | null; totalReviews: number };
  departments: { name: string; employees: number }[];
};

const today = new Date();
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const firstOfMonth = dateValue(new Date(today.getFullYear(), today.getMonth(), 1));
const todayValue = dateValue(today);
const number = (value: number) => new Intl.NumberFormat("en-IN").format(value || 0);
const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

function ReportsContent() {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayValue);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = sessionStorage.getItem("hrms_token") || "";
      const response = await fetch(`${API_URL}/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user"); window.location.href = "/login"; return;
      }
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load reports");
      setData(result.data);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load reports"); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["HRMS Reports", ""], ["From", data.range.from], ["To", data.range.to], [],
      ["Metric", "Value"], ["Active employees", data.employees.active], ["Total employees", data.employees.total],
      ["Present attendance", data.attendance.present], ["Half-day attendance", data.attendance["half-day"]],
      ["Absent attendance", data.attendance.absent], ["Late arrivals", data.attendance.late],
      ["Leave requests", data.leave.totalRequests], ["Approved leave requests", data.leave.approved],
      ["Pending leave requests", data.leave.pending], ["Leave days", data.leave.totalDays],
      ["Payroll paid", data.payroll.paidNetPay], ["Payroll processed", data.payroll.processedNetPay],
      ["Performance reviews", data.performance.totalReviews], ["Average rating", data.performance.averageRating ?? "N/A"],
      [], ["Department", "Active employees"], ...data.departments.map((item) => [item.name, item.employees]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `hrms-report-${from}-to-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const cards = data ? [
    { label: "Active employees", value: number(data.employees.active), detail: `${number(data.employees.total)} total records`, icon: Users, tone: "text-blue-700 bg-blue-50" },
    { label: "Present attendance", value: number(data.attendance.present), detail: `${number(data.attendance.late)} late arrivals`, icon: Clock3, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Leave requests", value: number(data.leave.totalRequests), detail: `${number(data.leave.pending)} awaiting decision`, icon: CalendarDays, tone: "text-amber-700 bg-amber-50" },
    { label: "Payroll paid", value: currency(data.payroll.paidNetPay), detail: `${number(data.payroll.paidRecords)} paid records`, icon: Wallet, tone: "text-violet-700 bg-violet-50" },
    { label: "Performance reviews", value: number(data.performance.totalReviews), detail: data.performance.averageRating === null ? "No ratings yet" : `Average rating ${data.performance.averageRating}/5`, icon: ClipboardCheck, tone: "text-fuchsia-700 bg-fuchsia-50" },
  ] : [];

  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"><ArrowLeft size={16}/>Dashboard</Link>
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/20"><BarChart3 size={25}/></div><div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reports & Analytics</h1><p className="mt-1 text-sm text-slate-500">Company-wide HR metrics and operational summaries.</p></div></div>
        </div>
        <div className="flex flex-wrap gap-2"><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Refresh</button><button onClick={exportCsv} disabled={!data} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"><Download size={16}/>Export CSV</button></div>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-blue-600"/><h2 className="font-bold text-slate-900">Report period</h2></div>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:flex"><label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500"/></label><label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">To<input type="date" value={to} min={from} max={todayValue} onChange={(event) => setTo(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500"/></label><button onClick={() => { setFrom(firstOfMonth); setTo(todayValue); }} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:col-span-2 sm:w-auto xl:col-span-1">This month</button></div>
        <p className="mt-2 text-xs text-slate-400">Maximum date range: 367 days. Payroll totals use the months touched by this period.</p>
      </section>

      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {loading && !data ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading company reports…</div> : data && <>
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map((card) => { const Icon = card.icon; return <div key={card.label} className="hrms-premium-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{card.label}</span><span className={`rounded-xl p-2 ${card.tone}`}><Icon size={19}/></span></div><p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900">{card.value}</p><p className="mt-1 text-xs text-slate-500">{card.detail}</p></div>; })}</section>

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold text-slate-900">Attendance breakdown</h2>
            {[["Present", data.attendance.present, "bg-emerald-500"], ["Half-day", data.attendance["half-day"], "bg-amber-500"], ["Absent", data.attendance.absent, "bg-rose-500"]].map(([label, value, color]) => { const total = data.attendance.present + data.attendance["half-day"] + data.attendance.absent; const pct = total ? Math.round(Number(value) / total * 100) : 0; return <div key={String(label)} className="mb-4 last:mb-0"><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium text-slate-600">{label}</span><span className="font-semibold text-slate-800">{number(Number(value))} · {pct}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }}/></div></div>; })}
            <p className="mt-4 text-xs text-slate-400">Recorded attendance entries within the selected dates.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold text-slate-900">Leave request status</h2>
            {[["Pending", data.leave.pending], ["Approved", data.leave.approved], ["Rejected", data.leave.rejected], ["Cancelled", data.leave.cancelled]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0"><span className="text-sm text-slate-600">{label}</span><span className="text-sm font-bold tabular-nums text-slate-900">{number(Number(value))}</span></div>)}
            <p className="mt-3 text-xs text-slate-400">{number(data.leave.totalDays)} leave days across matching requests.</p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold text-slate-900">Payroll summary</h2><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-medium text-emerald-700">Paid net pay</p><p className="mt-2 break-words text-xl font-bold text-emerald-900">{currency(data.payroll.paidNetPay)}</p><p className="mt-1 text-xs text-emerald-700">{number(data.payroll.paidRecords)} records</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-medium text-amber-700">Processed, unpaid</p><p className="mt-2 break-words text-xl font-bold text-amber-900">{currency(data.payroll.processedNetPay)}</p><p className="mt-1 text-xs text-amber-700">{number(data.payroll.processedRecords)} records</p></div></div><p className="mt-4 text-xs text-slate-400">Payroll is aggregated by the calendar months touched by the selected date range.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold text-slate-900">Performance overview</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Pending", data.performance.pending], ["Self submitted", data.performance.selfSubmitted], ["Manager reviewed", data.performance.managerReviewed], ["Finalized", data.performance.finalized]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{number(Number(value))}</p></div>)}</div><p className="mt-4 text-sm text-slate-600">Average manager rating: <strong>{data.performance.averageRating === null ? "Not rated" : `${data.performance.averageRating} / 5`}</strong></p><p className="mt-1 text-xs text-slate-400">Performance totals include review cycles from the selected calendar years.</p></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Users size={18} className="text-blue-600"/><h2 className="font-bold text-slate-900">Active employees by department</h2></div>{data.departments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3 font-semibold">Department</th><th className="pb-3 text-right font-semibold">Employees</th></tr></thead><tbody>{data.departments.map((item) => <tr key={item.name} className="border-b border-slate-50 last:border-0"><td className="py-3 font-medium text-slate-700">{item.name}</td><td className="py-3 text-right font-bold tabular-nums text-slate-900">{number(item.employees)}</td></tr>)}</tbody></table></div> : <p className="py-5 text-sm text-slate-500">No active department records found.</p>}</section>
      </>}
    </div>
  </main>;
}

export default function ReportsPage() {
  return <AuthGuard><ReportsContent /></AuthGuard>;
}
