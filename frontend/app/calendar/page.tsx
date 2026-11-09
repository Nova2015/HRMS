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
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,_#e8efff_0%,_#f7f9fc_42%,_#f4f6fa_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"><ArrowLeft size={16} /> Dashboard</Link>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Company workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Company Calendar</h1>
            <p className="mt-2 text-sm text-slate-500">Company holidays and leave schedules, connected to HRMS records.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadData} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button>
            <button type="button" onClick={openApply} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"><Plus size={17} /> Apply Leave</button>
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white bg-white/80 p-5 shadow-sm backdrop-blur"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">Calendar events</span><CalendarDays size={19} className="text-indigo-600" /></div><p className="mt-3 text-3xl font-bold text-slate-950">{loading ? "—" : monthEvents.length}</p><p className="mt-1 text-xs text-slate-500">For the selected month</p></div>
          <div className="rounded-2xl border border-white bg-white/80 p-5 shadow-sm backdrop-blur"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">Company holidays</span><PartyPopper size={19} className="text-rose-600" /></div><p className="mt-3 text-3xl font-bold text-slate-950">{loading ? "—" : holidays.filter((item) => item.isActive && item.dateKey.startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}-`)).length}</p><p className="mt-1 text-xs text-slate-500">Active in {monthLabel(month)}</p></div>
          <div className="rounded-2xl border border-white bg-white/80 p-5 shadow-sm backdrop-blur"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">Pending leave requests</span><Clock3 size={19} className="text-amber-600" /></div><p className="mt-3 text-3xl font-bold text-slate-950">{loading ? "—" : pendingLeaves}</p><p className="mt-1 text-xs text-slate-500">{isAdmin ? "Company-wide" : "Your requests"}</p></div>
        </section>

        {showForm && <section className="mb-6 rounded-2xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-900/5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">Leave application</h2><p className="mt-1 text-sm text-slate-500">This submits to the existing HRMS Leave Management workflow.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
          <form onSubmit={submitLeave} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Leave type<select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"><option value="casual">Casual Leave</option><option value="sick">Sick Leave</option><option value="earned">Earned Leave</option><option value="unpaid">Unpaid Leave</option></select></label>
            <label className="text-sm font-medium text-slate-700">Start date<input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium text-slate-700">End date<input required type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">Reason<textarea required minLength={5} maxLength={1000} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Enter reason for leave" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Send size={16} />{saving ? "Submitting…" : "Submit request"}</button></div>
          </form>
        </section>}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
          <div className="rounded-3xl border border-white bg-white/85 p-4 shadow-xl shadow-slate-900/5 backdrop-blur sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Schedule</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{monthLabel(month)}</h2></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() - 1, 1); setMonth(next); setSelected(dateKey(next)); }} aria-label="Previous month" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><ChevronLeft size={18} /></button><button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(dateKey(now)); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Today</button><button type="button" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); setMonth(next); setSelected(dateKey(next)); }} aria-label="Next month" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><ChevronRight size={18} /></button></div>
            </div>
            <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = dateKey(day);
                const inMonth = day.getMonth() === month.getMonth();
                const dayEvents = events.filter((event) => event.dateKey === key);
                const isSelected = selected === key;
                const isToday = key === dateKey(new Date());
                return <button key={key} type="button" onClick={() => setSelected(key)} className={`relative min-h-[76px] border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-indigo-50/70 sm:min-h-[104px] sm:p-2.5 ${!inMonth ? "bg-slate-50/60 text-slate-300" : "text-slate-700"} ${isSelected ? "bg-indigo-50 ring-2 ring-inset ring-indigo-500" : ""}`}>
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm ${isToday ? "bg-indigo-600 text-white" : ""} ${isSelected && !isToday ? "bg-indigo-100 text-indigo-800" : ""}`}>{day.getDate()}</span>
                  <span className="mt-1 flex flex-col gap-1">{dayEvents.slice(0,2).map((event) => <span key={event.id} className={`truncate rounded px-1 py-0.5 text-[9px] font-semibold sm:text-[10px] ${event.kind === "holiday" ? "bg-rose-100 text-rose-700" : event.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{event.title}</span>)}{dayEvents.length > 2 && <span className="text-[9px] text-slate-400">+{dayEvents.length - 2} more</span>}</span>
                </button>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" />Holiday</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Approved leave</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Pending leave</span></div>
          </div>

          <aside className="rounded-3xl border border-white bg-white/85 p-5 shadow-xl shadow-slate-900/5 backdrop-blur sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Daily timeline</p><h2 className="mt-1 text-xl font-bold text-slate-950">{parseDate(selected).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</h2></div><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><CalendarCheck2 size={20} /></span></div>
            {loading ? <p className="py-8 text-sm text-slate-500">Loading calendar events…</p> : selectedEvents.length ? <div className="space-y-3">{selectedEvents.map((event) => <div key={event.id} className="flex gap-3 rounded-2xl border border-slate-100 p-3"><div className={`mt-0.5 rounded-xl p-2 ${event.kind === "holiday" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>{event.kind === "holiday" ? <PartyPopper size={18} /> : <Palmtree size={18} />}</div><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{event.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{event.detail}</p></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center"><CalendarDays className="mx-auto mb-2 text-slate-300" size={28} /><p className="text-sm font-semibold text-slate-700">No scheduled events</p><p className="mt-1 text-xs text-slate-500">No holiday or leave record is listed for this date.</p></div>}
            <div className="mt-5 border-t border-slate-100 pt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Quick actions</p><Link href="/leaves" className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"><span className="flex items-center gap-2"><Palmtree size={17} className="text-indigo-600" /> Leave management</span><ChevronRight size={16} /></Link><Link href="/holidays" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"><span className="flex items-center gap-2"><PartyPopper size={17} className="text-rose-600" /> Holiday settings</span><ChevronRight size={16} /></Link></div>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function CalendarPage() {
  return <AuthGuard><CompanyCalendar /></AuthGuard>;
}
