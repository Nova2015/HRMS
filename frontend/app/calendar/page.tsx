"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus,
  RefreshCw, Send, X, PartyPopper, Palmtree, CalendarCheck2
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type Holiday = {
  _id: string;
  name: string;
  dateKey: string;
  type: "public" | "optional" | "company";
  description?: string;
  isActive: boolean;
};
type LeaveRequest = {
  _id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  employee?: { firstName: string; lastName: string; employeeCode: string };
};
type CalendarEvent = {
  id: string;
  dateKey: string;
  title: string;
  detail: string;
  kind: "holiday" | "leave";
  status?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const monthLabel = (date: Date) => date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const statusTone: Record<LeaveRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-100 text-slate-600",
};

function CompanyCalendar() {
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveType: "casual", startDate: dateKey(new Date()), endDate: dateKey(new Date()), reason: "" });

  const isAdmin = role === "admin" || role === "hr";

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.replace("/login");
      throw new Error("Please login again.");
    }
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      cache: "no-store",
    });
    const result = await response.json();
    if (response.status === 401) {
      sessionStorage.removeItem("hrms_token");
      sessionStorage.removeItem("hrms_user");
      router.replace("/login");
      throw new Error("Session expired. Please login again.");
    }
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed.");
    return result;
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [holidayResult, leaveResult] = await Promise.all([
        api(`/holidays?year=${month.getFullYear()}${isAdmin ? "&includeInactive=true" : ""}`),
        api("/leaves"),
      ]);
      setHolidays(Array.isArray(holidayResult.data) ? holidayResult.data : []);
      setLeaves(Array.isArray(leaveResult.data) ? leaveResult.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load calendar data.");
    } finally {
      setLoading(false);
    }
  }, [api, isAdmin, month]);

  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
    } catch { setRole("employee"); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const events = useMemo<CalendarEvent[]>(() => {
    const holidayEvents = holidays.filter((item) => item.isActive || isAdmin).map((item) => ({
      id: `holiday-${item._id}`, dateKey: item.dateKey, title: item.name,
      detail: `${item.type} holiday`, kind: "holiday" as const,
    }));
    const leaveEvents: CalendarEvent[] = [];
    for (const leave of leaves) {
      if (leave.status === "rejected" || leave.status === "cancelled") continue;
      const start = parseDate(leave.startDate);
      const end = parseDate(leave.endDate);
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = dateKey(cursor);
        if (key.startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}-`)) {
          const employee = leave.employee ? `${leave.employee.firstName} ${leave.employee.lastName}` : "My leave";
          leaveEvents.push({
            id: `leave-${leave._id}-${key}`, dateKey: key,
            title: employee, detail: `${leave.leaveType} leave · ${leave.status}`,
            kind: "leave", status: leave.status,
          });
        }
      }
    }
    return [...holidayEvents, ...leaveEvents];
  }, [holidays, isAdmin, leaves, month]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const selectedEvents = events.filter((event) => event.dateKey === selected);
  const monthEvents = events.filter((event) => event.dateKey.startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}-`));
  const pendingLeaves = leaves.filter((leave) => leave.status === "pending").length;

  const openApply = () => {
    setForm((current) => ({ ...current, startDate: selected, endDate: selected }));
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const submitLeave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await api("/leaves", { method: "POST", body: JSON.stringify(form) });
      setNotice(result.message || "Leave request submitted.");
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit leave request.");
    } finally { setSaving(false); }
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-28 -top-32 h-96 w-96 rounded-full bg-indigo-200/35 blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-violet-200/30 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"><ArrowLeft size={16} /> Back to dashboard</Link>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-3 text-white shadow-lg shadow-indigo-500/20"><CalendarDays size={25} /></div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600">Nexus HRMS · Workspace</p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Company Calendar</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-slate-500">A shared view of company holidays and employee leave schedules.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={loadData} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/90 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button>
            <button type="button" onClick={openApply} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl"><Plus size={17} /> Apply for leave</button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm font-medium text-rose-700">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm font-medium text-emerald-700">{notice}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="group rounded-2xl border border-white/90 bg-white/75 p-5 shadow-[0_8px_30px_rgba(31,41,55,0.05)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Scheduled items</span><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><CalendarDays size={19} /></span></div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{loading ? "—" : monthEvents.length}</p><p className="mt-1 text-xs text-slate-400">In {monthLabel(month)}</p>
          </div>
          <div className="group rounded-2xl border border-white/90 bg-white/75 p-5 shadow-[0_8px_30px_rgba(31,41,55,0.05)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Company holidays</span><span className="rounded-xl bg-rose-50 p-2.5 text-rose-600"><PartyPopper size={19} /></span></div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{loading ? "—" : holidays.filter((item) => item.isActive && item.dateKey.startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}-`)).length}</p><p className="mt-1 text-xs text-slate-400">Active holidays this month</p>
          </div>
          <div className="group rounded-2xl border border-white/90 bg-white/75 p-5 shadow-[0_8px_30px_rgba(31,41,55,0.05)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Pending leave requests</span><span className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><Clock3 size={19} /></span></div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{loading ? "—" : pendingLeaves}</p><p className="mt-1 text-xs text-slate-400">{isAdmin ? "Across the company" : "Your requests"}</p>
          </div>
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
          <div className="overflow-hidden rounded-[28px] border border-white/90 bg-white/80 p-4 shadow-[0_18px_55px_rgba(31,41,55,0.08)] backdrop-blur-2xl sm:p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-500">Your schedule</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{monthLabel(month)}</h2><p className="mt-1 text-xs text-slate-400">Select a date to view its schedule</p></div>
              <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-1.5">
                <button type="button" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() - 1, 1); setMonth(next); setSelected(dateKey(next)); }} aria-label="Previous month" className="rounded-xl p-2.5 text-slate-500 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm"><ChevronLeft size={18} /></button>
                <button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(dateKey(now)); }} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:text-indigo-600">Today</button>
                <button type="button" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); setMonth(next); setSelected(dateKey(next)); }} aria-label="Next month" className="rounded-xl p-2.5 text-slate-500 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 border-b border-slate-100 pb-3 text-center text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400 sm:gap-2 sm:text-[11px]">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
              {days.map((day) => {
                const key = dateKey(day);
                const inMonth = day.getMonth() === month.getMonth();
                const dayEvents = events.filter((event) => event.dateKey === key);
                const isSelected = selected === key;
                const isToday = key === dateKey(new Date());
                return <button key={key} type="button" onClick={() => setSelected(key)} aria-pressed={isSelected} className={`group relative flex min-h-[78px] flex-col items-start rounded-2xl border p-1.5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:min-h-[112px] sm:p-2.5 ${!inMonth ? "border-transparent bg-slate-50/50 text-slate-300" : "border-slate-100/90 bg-white/70 text-slate-700 hover:border-indigo-200"} ${isSelected ? "border-indigo-300 bg-indigo-50/90 shadow-[0_5px_18px_rgba(99,102,241,0.12)] ring-1 ring-indigo-200" : ""}`}>
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold sm:h-8 sm:w-8 sm:text-sm ${isToday ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25" : isSelected ? "bg-indigo-100 text-indigo-700" : ""}`}>{day.getDate()}</span>
                  <span className="mt-1.5 flex w-full flex-col gap-1">{dayEvents.slice(0,2).map((event) => <span key={event.id} className={`w-full truncate rounded-md px-1 py-1 text-[8px] font-bold leading-tight sm:text-[10px] ${event.kind === "holiday" ? "bg-rose-50 text-rose-700" : event.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{event.title}</span>)}{dayEvents.length > 2 && <span className="px-1 text-[9px] font-semibold text-slate-400">+{dayEvents.length - 2} more</span>}</span>
                </button>;
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" />Company holiday</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Approved leave</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Pending leave</span></div>
          </div>

          <aside className="rounded-[28px] border border-white/90 bg-white/80 p-5 shadow-[0_18px_55px_rgba(31,41,55,0.08)] backdrop-blur-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-indigo-500">Daily timeline</p><h2 className="mt-2 text-xl font-extrabold leading-snug text-slate-950">{parseDate(selected).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</h2><p className="mt-1 text-xs text-slate-400">{selectedEvents.length} {selectedEvents.length === 1 ? "scheduled item" : "scheduled items"}</p></div><span className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 p-3 text-indigo-600"><CalendarCheck2 size={21} /></span></div>
            {loading ? <div className="space-y-3 py-4"><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /></div> : selectedEvents.length ? <div className="space-y-3">{selectedEvents.map((event) => <div key={event.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3.5 transition hover:border-indigo-100 hover:shadow-sm"><div className={`mt-0.5 rounded-xl p-2.5 ${event.kind === "holiday" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>{event.kind === "holiday" ? <PartyPopper size={18} /> : <Palmtree size={18} />}</div><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{event.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{event.detail}</p></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center"><CalendarDays className="mx-auto mb-3 text-slate-300" size={30} /><p className="text-sm font-bold text-slate-700">Nothing scheduled</p><p className="mt-1 text-xs leading-relaxed text-slate-400">No holiday or leave record is listed for this date.</p></div>}
            <div className="mt-6 border-t border-slate-100 pt-5"><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Quick access</p><Link href="/leaves" className="mb-2 flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 px-3.5 py-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"><span className="flex items-center gap-2"><Palmtree size={17} className="text-indigo-500" /> Leave management</span><ChevronRight size={16} /></Link><Link href="/holidays" className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 px-3.5 py-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"><span className="flex items-center gap-2"><PartyPopper size={17} className="text-rose-500" /> Holiday settings</span><ChevronRight size={16} /></Link></div>
          </aside>
        </section>

        {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="leave-modal-title" className="my-auto w-full max-w-xl animate-[fadeIn_180ms_ease-out] rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.22)] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-indigo-500">Leave request</p><h2 id="leave-modal-title" className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Apply for leave</h2><p className="mt-1 text-sm text-slate-500">Your request will follow the existing HR approval process.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close leave application" className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"><X size={18} /></button></div>
            <form onSubmit={submitLeave} className="space-y-4">
              <div className="rounded-2xl bg-indigo-50/80 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo-500">Selected date</p><p className="mt-1 font-bold text-indigo-950">{parseDate(form.startDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
              <label className="block text-sm font-bold text-slate-700">Leave type<select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"><option value="earned">Annual Leave</option><option value="sick">Sick Leave</option><option value="casual">Casual Leave</option><option value="unpaid">Unpaid Leave</option></select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-700">Start date<input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label><label className="block text-sm font-bold text-slate-700">End date<input required type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label></div>
              <label className="block text-sm font-bold text-slate-700">Reason<textarea required minLength={5} maxLength={1000} rows={4} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Please share a brief reason for your leave..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-5 sm:flex-row"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"><Send size={16} />{saving ? "Submitting…" : "Submit request"}</button></div>
            </form>
          </section>
        </div>}
      </div>
    </main>
  );
}

export default function CalendarPage() {
  return <AuthGuard><CompanyCalendar /></AuthGuard>;
}
