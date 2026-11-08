"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays, CalendarPlus, RefreshCw, Send, Check, X, ArrowLeft,
  ChevronLeft, ChevronRight, Users, Clock3, CheckCircle2, XCircle
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveRequest = {
  _id: string;
  leaveType: "casual" | "sick" | "earned" | "unpaid";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  reviewComment?: string;
  createdAt: string;
  employee?: {
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
};

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const statusStyles: Record<LeaveStatus, string> = {
  pending: "border-amber-300 bg-amber-100 text-amber-800",
  approved: "border-emerald-300 bg-emerald-100 text-emerald-800",
  rejected: "border-rose-300 bg-rose-100 text-rose-800",
  cancelled: "border-slate-300 bg-slate-100 text-slate-600",
};

function LeaveManagement() {
  const router = useRouter();
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const [form, setForm] = useState({
    leaveType: "casual",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const isCompanyReviewer = role === "admin" || role === "hr";
  const isManager = role === "manager";
  const canReview = isCompanyReviewer || isManager;

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.replace("/login");
      throw new Error("Please login again");
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
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Request failed");
    }
    return result;
  }, [router]);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = canReview && filter !== "all"
        ? `?status=${encodeURIComponent(filter)}`
        : "";
      const result = await request(`/leaves${query}`);
      setItems(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [filter, canReview, request]);

  useEffect(() => {
    const stored = sessionStorage.getItem("hrms_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setRole(user.role || "employee");
      } catch {
        setRole("employee");
      }
    }
  }, []);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  const submitLeave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await request("/leaves", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMessage(result.message || "Leave request submitted.");
      setForm({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
      setShowForm(false);
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit leave request");
    } finally {
      setSaving(false);
    }
  };

  const openApplyForm = (date = "") => {
    setSelectedDate(date);
    setForm((previous) => ({
      ...previous,
      startDate: date || previous.startDate,
      endDate: date || previous.endDate,
    }));
    setShowForm(true);
    window.setTimeout(() => {
      document.getElementById("leave-application-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const reviewLeave = async (id: string, decision: "approved" | "rejected") => {
    const reviewComment = window.prompt(
      decision === "approved" ? "Approval comment (optional):" : "Reason for rejection:"
    );
    if (reviewComment === null) return;
    if (decision === "rejected" && !reviewComment.trim()) {
      setError("Please enter a reason before rejecting the request.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await request(`/leaves/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reviewComment }),
      });
      setMessage(result.message || "Leave request updated.");
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review leave request");
    } finally {
      setSaving(false);
    }
  };

  const cancelLeave = async (id: string) => {
    if (!window.confirm("Cancel this pending leave request?")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await request(`/leaves/${id}/cancel`, { method: "PATCH" });
      setMessage(result.message || "Leave request cancelled.");
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel leave request");
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = calendarMonth.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const offset = first.getDay();
    const count = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < offset; i += 1) {
      const date = new Date(first);
      date.setDate(date.getDate() - (offset - i));
      cells.push({ key: dateKey(date), day: date.getDate(), inMonth: false });
    }
    for (let day = 1; day <= count; day += 1) {
      const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
      cells.push({ key: dateKey(date), day, inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = new Date(`${cells[cells.length - 1].key}T00:00:00`);
      last.setDate(last.getDate() + 1);
      cells.push({ key: dateKey(last), day: last.getDate(), inMonth: false });
    }
    return cells;
  }, [calendarMonth]);

  const summary = useMemo(() => ({
    total: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
  }), [items]);

  const heading = isCompanyReviewer
    ? "Company Leave Overview"
    : isManager
      ? "Team Leave Overview"
      : "My Leave Overview";
  const description = isCompanyReviewer
    ? "Company-wide leave requests, approvals and calendar."
    : isManager
      ? "Only employees assigned to you and their leave requests are shown."
      : "Apply for leave from the calendar and track your request status.";

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-blue-600 transition hover:text-blue-800">
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{heading}</h1>
            <p className="mt-2 text-slate-500">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadLeaves} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button type="button" onClick={() => openApplyForm()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md">
              <CalendarPlus size={17} /> Apply Leave
            </button>
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-center justify-between"><span className="text-sm text-blue-100">Total Requests</span><Users size={20} /></div>
            <p className="mt-3 text-3xl font-bold">{summary.total}</p>
            <p className="mt-1 text-xs text-blue-100">{isManager ? "Assigned team" : isCompanyReviewer ? "All employees" : "Your submissions"}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
            <div className="flex items-center justify-between text-amber-700"><span className="text-sm font-medium">Pending</span><Clock3 size={20} /></div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{summary.pending}</p>
            <p className="mt-1 text-xs text-slate-500">Awaiting review</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
            <div className="flex items-center justify-between text-emerald-700"><span className="text-sm font-medium">Approved</span><CheckCircle2 size={20} /></div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{summary.approved}</p>
            <p className="mt-1 text-xs text-slate-500">Approved leave requests</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
            <div className="flex items-center justify-between text-rose-700"><span className="text-sm font-medium">Rejected</span><XCircle size={20} /></div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{summary.rejected}</p>
            <p className="mt-1 text-xs text-slate-500">Requests not approved</p>
          </div>
        </section>

        {showForm && (
          <section id="leave-application-form" className="mb-6 scroll-mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm transition-all duration-300 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><CalendarDays size={22} /></div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Apply for Leave</h2>
                  <p className="text-sm text-slate-500">Choose dates from the calendar or enter them below.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">Close</button>
            </div>
            <form onSubmit={submitLeave} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Leave Type *</label>
                <select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="casual">Casual Leave</option><option value="sick">Sick Leave</option><option value="earned">Earned Leave</option><option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Selected Calendar Date</label>
                <input readOnly value={selectedDate || "Choose a date on the calendar"} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Start Date *</label>
                <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate && form.endDate < e.target.value ? e.target.value : form.endDate })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">End Date *</label>
                <input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason *</label>
                <textarea required minLength={5} maxLength={1000} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Enter reason for leave" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                  <Send size={16} /> {saving ? "Submitting..." : "Submit Leave Request"}
                </button>
              </div>
            </form>
            <p className="mt-4 text-xs text-slate-500">Working days exclude assigned shift weekly offs and active public/company holidays. Optional holidays are not deducted.</p>
          </section>
        )}

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 sm:px-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Leave Calendar</h2>
              <p className="mt-1 text-sm text-slate-500">Select any date to start a leave application.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100"><ChevronLeft size={18} /></button>
              <span className="min-w-36 text-center text-sm font-bold text-slate-800">{monthLabel}</span>
              <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100"><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-3">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const dayItems = items.filter((item) => item.startDate <= day.key && item.endDate >= day.key);
              const isToday = day.key === dateKey(new Date());
              const isSelected = selectedDate === day.key;
              return (
                <button
                  type="button"
                  key={day.key}
                  onClick={() => openApplyForm(day.key)}
                  className={`group min-h-24 border-b border-r border-slate-100 p-1.5 text-left transition duration-200 hover:bg-blue-50 sm:min-h-28 sm:p-2.5 ${day.inMonth ? "bg-white" : "bg-slate-50/70"} ${isSelected ? "ring-2 ring-inset ring-blue-500 bg-blue-50" : ""}`}
                >
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${isToday ? "bg-blue-600 text-white" : day.inMonth ? "text-slate-700 group-hover:bg-blue-100" : "text-slate-400"}`}>{day.day}</span>
                  <div className="mt-1 space-y-1">
                    {dayItems.slice(0, 2).map((item) => (
                      <div key={item._id} title={`${item.status}: ${item.reason}`} className={`truncate rounded-md border px-1.5 py-1 text-[9px] font-semibold leading-tight sm:text-[10px] ${statusStyles[item.status]}`}>
                        {canReview ? `${item.employee?.firstName || "Employee"} · ${item.status}` : item.status}
                      </div>
                    ))}
                    {dayItems.length > 2 && <p className="px-1 text-[9px] font-medium text-slate-500">+{dayItems.length - 2} more</p>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-600">
            {(["pending", "approved", "rejected", "cancelled"] as LeaveStatus[]).map((status) => (
              <span key={status} className="inline-flex items-center gap-2 capitalize"><span className={`h-2.5 w-2.5 rounded-full ${status === "pending" ? "bg-amber-400" : status === "approved" ? "bg-emerald-500" : status === "rejected" ? "bg-rose-500" : "bg-slate-400"}`} />{status}</span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{isCompanyReviewer ? "Company Leave Register" : isManager ? "My Team Leave Requests" : "My Leave History"}</h2>
              <p className="mt-1 text-sm text-slate-500">{isCompanyReviewer ? "All employee submissions" : isManager ? "Requests from employees assigned to you" : "Your submitted leave requests"}</p>
            </div>
            {canReview && (
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option value="all">All Requests</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>

          {loading ? (
            <p className="py-10 text-center text-slate-500">Loading leave requests...</p>
          ) : items.length === 0 ? (
            <div className="py-12 text-center"><CalendarDays className="mx-auto mb-3 text-slate-300" size={34} /><p className="font-medium text-slate-700">No leave requests found.</p><p className="mt-1 text-sm text-slate-500">New requests will appear here and on the calendar.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600"><tr>
                  {canReview && <th className="px-4 py-3 font-semibold">Employee</th>}
                  <th className="px-4 py-3 font-semibold">Leave Type</th><th className="px-4 py-3 font-semibold">From</th><th className="px-4 py-3 font-semibold">To</th><th className="px-4 py-3 font-semibold">Days</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Action</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item._id} className="transition hover:bg-slate-50">
                      {canReview && <td className="px-4 py-4"><p className="font-semibold text-slate-900">{item.employee?.firstName} {item.employee?.lastName}</p><p className="text-xs text-slate-500">{item.employee?.employeeCode}</p></td>}
                      <td className="px-4 py-4 capitalize">{item.leaveType}</td><td className="px-4 py-4">{item.startDate}</td><td className="px-4 py-4">{item.endDate}</td><td className="px-4 py-4">{item.totalDays}</td><td className="max-w-xs whitespace-normal px-4 py-4">{item.reason}</td>
                      <td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[item.status]}`}>{item.status}</span>{item.reviewComment && <p className="mt-2 text-xs text-slate-500">{item.reviewComment}</p>}</td>
                      <td className="px-4 py-4">
                        {canReview && item.status === "pending" ? <div className="flex gap-2">
                          <button type="button" disabled={saving} onClick={() => reviewLeave(item._id, "approved")} title="Approve" className="rounded-lg bg-emerald-600 p-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"><Check size={16} /></button>
                          <button type="button" disabled={saving} onClick={() => reviewLeave(item._id, "rejected")} title="Reject" className="rounded-lg bg-rose-600 p-2 text-white transition hover:bg-rose-700 disabled:opacity-50"><X size={16} /></button>
                        </div> : !canReview && item.status === "pending" ? <button type="button" disabled={saving} onClick={() => cancelLeave(item._id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function LeavesPage() {
  return <AuthGuard><LeaveManagement /></AuthGuard>;
}
