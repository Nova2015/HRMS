"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays, CalendarPlus, RefreshCw, Send, Check, X, ArrowLeft,
  Users, Clock3, CheckCircle2, XCircle
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveEmployee = { _id: string; employeeCode: string; firstName: string; lastName: string; employmentStatus?: string };
type LeaveBalance = { _id: string; year: number; employee: LeaveEmployee; casual: number; sick: number; earned: number; balances: Record<"casual" | "sick" | "earned", { allocated: number; reserved: number; available: number }> };

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
  employee?: { _id: string; employeeCode: string; firstName: string; lastName: string };
};

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
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  const [allocationYear, setAllocationYear] = useState(String(new Date().getFullYear()));
  const [allocationEmployees, setAllocationEmployees] = useState<LeaveEmployee[]>([]);
  const [allocations, setAllocations] = useState<LeaveBalance[]>([]);
  const [allocationSearch, setAllocationSearch] = useState("");
  const [allocationForm, setAllocationForm] = useState({ employeeId: "", casual: "0", sick: "0", earned: "0" });

  const isCompanyReviewer = role === "admin" || role === "hr";
  const canManage = isCompanyReviewer;
  const isManager = role === "manager";
  const canReview = isCompanyReviewer || isManager;

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) { router.replace("/login"); throw new Error("Please login again"); }
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
      cache: "no-store",
    });
    const result = await response.json();
    if (response.status === 401) {
      sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user"); router.replace("/login");
      throw new Error("Session expired. Please login again.");
    }
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, [router]);

  const loadLeaves = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = canReview && filter !== "all" ? `?status=${encodeURIComponent(filter)}` : "";
      const result = await request(`/leaves${query}`); setItems(result.data || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load leave requests"); }
    finally { setLoading(false); }
  }, [filter, canReview, request]);

  useEffect(() => {
    const stored = sessionStorage.getItem("hrms_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        void Promise.resolve().then(() => { setRole(user.role || "employee"); setEmployeeId(user.employeeId || ""); });
      } catch { void Promise.resolve().then(() => setRole("employee")); }
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadLeaves); }, [loadLeaves]);

  const loadAllocations = useCallback(async () => {
    try {
      const result = await request(`/leave-allocations?year=${encodeURIComponent(allocationYear)}`);
      const loadedAllocations = result.data || []; setAllocations(loadedAllocations);
      if (canManage) {
        const employeeResult = await request("/employees");
        const activeEmployees = (employeeResult.data || []).filter((employee: LeaveEmployee) => employee.employmentStatus === "active");
        setAllocationEmployees(activeEmployees);
        const selectedId = activeEmployees.some((employee: LeaveEmployee) => employee._id === allocationForm.employeeId) ? allocationForm.employeeId : activeEmployees[0]?._id || "";
        const existing = loadedAllocations.find((item: LeaveBalance) => item.employee?._id === selectedId);
        setAllocationForm({ employeeId: selectedId, casual: String(existing?.casual ?? 0), sick: String(existing?.sick ?? 0), earned: String(existing?.earned ?? 0) });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load leave allocations"); }
  }, [request, allocationYear, canManage, allocationForm.employeeId]);
  useEffect(() => { void loadAllocations(); }, [loadAllocations]);

  const saveAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const result = await request("/leave-allocations", { method: "PUT", body: JSON.stringify({ employeeId: allocationForm.employeeId, year: Number(allocationYear), casual: Number(allocationForm.casual), sick: Number(allocationForm.sick), earned: Number(allocationForm.earned) }) });
      setMessage(result.message || "Leave allocation saved."); await loadAllocations();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save leave allocation"); }
    finally { setSaving(false); }
  };

  const submitLeave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const result = await request("/leaves", { method: "POST", body: JSON.stringify(form) });
      setMessage(result.message || "Leave request submitted."); setForm({ leaveType: "casual", startDate: "", endDate: "", reason: "" }); setShowForm(false);
      await loadLeaves(); await loadAllocations();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit leave request"); }
    finally { setSaving(false); }
  };

  const openApplyForm = () => {
    setShowForm(true);
    window.setTimeout(() => document.getElementById("leave-application-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const reviewLeave = async (id: string, decision: "approved" | "rejected") => {
    const reviewComment = window.prompt(decision === "approved" ? "Approval comment (optional):" : "Reason for rejection:");
    if (reviewComment === null) return;
    if (decision === "rejected" && !reviewComment.trim()) { setError("Please enter a reason before rejecting the request."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await request(`/leaves/${id}/review`, { method: "PATCH", body: JSON.stringify({ decision, reviewComment }) });
      setMessage(result.message || "Leave request updated."); await loadLeaves(); await loadAllocations();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to review leave request"); }
    finally { setSaving(false); }
  };
  const cancelLeave = async (id: string) => {
    if (!window.confirm("Cancel this pending leave request?")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await request(`/leaves/${id}/cancel`, { method: "PATCH" });
      setMessage(result.message || "Leave request cancelled."); await loadLeaves(); await loadAllocations();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to cancel leave request"); }
    finally { setSaving(false); }
  };

  const summary = useMemo(() => ({ total: items.length, pending: items.filter((item) => item.status === "pending").length, approved: items.filter((item) => item.status === "approved").length, rejected: items.filter((item) => item.status === "rejected").length }), [items]);
  const heading = isCompanyReviewer ? "Company Leave Overview" : isManager ? "Team Leave Overview" : "My Leave Overview";
  const description = isCompanyReviewer ? "Company-wide leave requests, approvals and calendar." : isManager ? "Only employees assigned to you and their leave requests are shown." : "Apply for leave from the calendar and track your request status.";
  const visibleAllocations = useMemo(() => {
    const term = allocationSearch.trim().toLowerCase();
    if (!term) return allocations;
    return allocations.filter((allocation) => `${allocation.employee?.firstName || ""} ${allocation.employee?.lastName || ""} ${allocation.employee?.employeeCode || ""}`.toLowerCase().includes(term));
  }, [allocations, allocationSearch]);
  const fieldClass = "mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const fieldLabelClass = "block min-w-0 text-xs font-semibold text-slate-600";

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div><Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-blue-600 transition hover:text-blue-800"><ArrowLeft size={16} /> Dashboard</Link><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{heading}</h1><p className="mt-2 text-slate-500">{description}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={loadLeaves} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:shadow-md disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button><button type="button" onClick={openApplyForm} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"><CalendarPlus size={17} /> Apply Leave</button></div>
        </header>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex min-h-[132px] flex-col rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-blue-100">Total Requests</span><Users size={20} /></div><p className="mt-3 text-3xl font-bold">{summary.total}</p><p className="mt-1 text-xs text-blue-100">{isManager ? "Assigned team" : isCompanyReviewer ? "All employees" : "Your submissions"}</p></div>
          <div className="flex min-h-[132px] flex-col rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-amber-700"><span className="text-sm font-medium">Pending</span><Clock3 size={20} /></div><p className="mt-3 text-3xl font-bold text-slate-900">{summary.pending}</p><p className="mt-1 text-xs text-slate-500">Awaiting review</p></div>
          <div className="flex min-h-[132px] flex-col rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-emerald-700"><span className="text-sm font-medium">Approved</span><CheckCircle2 size={20} /></div><p className="mt-3 text-3xl font-bold text-slate-900">{summary.approved}</p><p className="mt-1 text-xs text-slate-500">Approved leave requests</p></div>
          <div className="flex min-h-[132px] flex-col rounded-2xl border border-rose-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-rose-700"><span className="text-sm font-medium">Rejected</span><XCircle size={20} /></div><p className="mt-3 text-3xl font-bold text-slate-900">{summary.rejected}</p><p className="mt-1 text-xs text-slate-500">Requests not approved</p></div>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-bold text-slate-900">{canManage ? "Leave Allocation & Balance" : "My Leave Balance"}</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">Annual Casual, Sick and Earned Leave balances. Pending requests are reserved until approved or rejected.</p></div>
            <label className="flex w-fit items-center gap-3 text-sm font-semibold text-slate-600">Year<input type="number" min="2000" max="2100" value={allocationYear} onChange={(e) => setAllocationYear(e.target.value)} className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          </div>
          {canManage && (
            <form onSubmit={saveAllocation} className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="mb-4"><h3 className="text-sm font-bold text-slate-800">Assign annual leave</h3><p className="mt-1 text-xs text-slate-500">Choose an active employee and enter the number of days for each leave type.</p></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                <label className={`${fieldLabelClass} lg:col-span-4`}>Employee<select required value={allocationForm.employeeId} onChange={(e) => { const selected = e.target.value; const existing = allocations.find((item) => item.employee?._id === selected); setAllocationForm({ employeeId: selected, casual: String(existing?.casual ?? 0), sick: String(existing?.sick ?? 0), earned: String(existing?.earned ?? 0) }); }} className={fieldClass}><option value="" disabled>Select employee</option>{allocationEmployees.map((employee) => <option key={employee._id} value={employee._id}>{employee.firstName} {employee.lastName} ({employee.employeeCode})</option>)}</select></label>
                {(["casual", "sick", "earned"] as const).map((type) => <label key={type} className={`${fieldLabelClass} lg:col-span-2`}>{type === "casual" ? "Casual leave (days)" : type === "sick" ? "Sick leave (days)" : "Earned leave (days)"}<input required type="number" min="0" max="366" step="1" value={allocationForm[type]} onChange={(e) => setAllocationForm({ ...allocationForm, [type]: e.target.value })} className={fieldClass} /></label>)}
                <div className="sm:col-span-2 lg:col-span-2"><button type="submit" disabled={saving || !allocationForm.employeeId} className="flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save Allocation"}</button></div>
              </div>
            </form>
          )}
          {allocations.length === 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{canManage ? "No leave allocations found for this year. Select an employee and assign leave days above." : "HR has not assigned leave for this year. Please contact HR."}</p> : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-xs font-bold text-slate-800">Employee leave balances <span className="ml-1 font-normal text-slate-500">({visibleAllocations.length})</span></h3><input type="search" value={allocationSearch} onChange={(e) => setAllocationSearch(e.target.value)} placeholder="Search employee / code..." aria-label="Search leave balances by employee name or code" className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 sm:w-64" /></div>
              <div className="max-h-80 overflow-auto"><table className="w-full min-w-[650px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-y border-slate-200 bg-white text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr>{canManage && <th className="px-4 py-3">Employee</th>}<th className="px-4 py-3">Leave type</th><th className="px-4 py-3 text-right">Allocated</th><th className="px-4 py-3 text-right">Pending / Used</th><th className="px-4 py-3 text-right">Available</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleAllocations.flatMap((allocation) => (["casual", "sick", "earned"] as const).map((type) => <tr key={allocation._id + type} className="text-xs transition-colors hover:bg-slate-50">
                  {canManage && <td className="px-2 py-1.5"><p className="whitespace-nowrap font-semibold text-slate-800">{allocation.employee?.firstName} {allocation.employee?.lastName}</p><p className="text-[10px] text-slate-500">{allocation.employee?.employeeCode}</p></td>}
                  <td className="px-2 py-1.5"><span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">{type} leave</span></td><td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{allocation.balances[type].allocated}</td><td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{allocation.balances[type].reserved}</td><td className="px-2 py-1.5 text-right font-bold tabular-nums text-emerald-700">{allocation.balances[type].available}</td>
                </tr>))}</tbody>
              </table></div>
            </div>
          )}
        </section>

        {showForm && <section id="leave-application-form" className="mb-6 scroll-mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 p-3 text-blue-700"><CalendarDays size={22} /></div><div><h2 className="text-xl font-bold text-slate-900">Apply for Leave</h2><p className="text-sm text-slate-500">Choose dates from the calendar or enter them below.</p></div></div><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">Close</button></div><form onSubmit={submitLeave} className="grid gap-4 md:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium text-slate-700">Leave Type *</label><select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="casual">Casual Leave</option><option value="sick">Sick Leave</option><option value="earned">Earned Leave</option><option value="unpaid">Unpaid Leave</option></select></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">Start Date *</label><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate && form.endDate < e.target.value ? e.target.value : form.endDate })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">End Date *</label><input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div><div className="md:col-span-2"><label className="mb-1.5 block text-sm font-medium text-slate-700">Reason *</label><textarea required minLength={5} maxLength={1000} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Enter reason for leave" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div><div className="flex flex-wrap justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"><Send size={16} /> {saving ? "Submitting..." : "Submit Leave Request"}</button></div></form><p className="mt-4 text-xs text-slate-500">Working days exclude assigned shift weekly offs and active public/company holidays. Optional holidays are not deducted.</p></section>}

        <section className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 text-blue-700" size={20} /><div><p className="font-semibold text-blue-950">Attendance Calendar is available in the Attendance module.</p><p className="mt-1 text-sm text-blue-800">Leave applications and approvals remain on this page. Use the date fields in the form to request leave.</p></div></div></section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">{isCompanyReviewer ? "Company Leave Register" : isManager ? "My Team Leave Requests" : "My Leave History"}</h2><p className="mt-1 text-sm text-slate-500">{isCompanyReviewer ? "All employee submissions" : isManager ? "Requests from employees assigned to you" : "Your submitted leave requests"}</p></div>{canReview && <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"><option value="all">All Requests</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>}</div>
          {loading ? <p className="py-10 text-center text-slate-500">Loading leave requests...</p> : items.length === 0 ? <div className="py-12 text-center"><CalendarDays className="mx-auto mb-3 text-slate-300" size={34} /><p className="font-medium text-slate-700">No leave requests found.</p><p className="mt-1 text-sm text-slate-500">New requests will appear here and on the calendar.</p></div> : <div className="max-h-96 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[850px] text-left text-sm"><thead className="sticky top-0 z-10 border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{canReview && <th className="whitespace-nowrap px-4 py-3 font-semibold">Employee</th>}<th className="px-4 py-3 font-semibold">Leave Type</th><th className="px-4 py-3 font-semibold">From</th><th className="px-4 py-3 font-semibold">To</th><th className="px-4 py-3 font-semibold">Days</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item._id} className="transition-colors hover:bg-slate-50/80">{canReview && <td className="px-4 py-4"><p className="font-semibold text-slate-900">{item.employee?.firstName} {item.employee?.lastName}</p><p className="text-xs text-slate-500">{item.employee?.employeeCode}</p></td>}<td className="px-4 py-4 capitalize">{item.leaveType}</td><td className="px-4 py-4">{item.startDate}</td><td className="px-4 py-4">{item.endDate}</td><td className="px-4 py-4">{item.totalDays}</td><td className="max-w-xs whitespace-normal px-4 py-4">{item.reason}</td><td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[item.status]}`}>{item.status}</span>{item.reviewComment && <p className="mt-2 text-xs text-slate-500">{item.reviewComment}</p>}</td><td className="px-4 py-4">{canReview && item.status === "pending" && !(isManager && item.employee?._id === employeeId) ? <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => reviewLeave(item._id, "approved")} title="Approve" className="rounded-lg bg-emerald-600 p-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"><Check size={16} /></button><button type="button" disabled={saving} onClick={() => reviewLeave(item._id, "rejected")} title="Reject" className="rounded-lg bg-rose-600 p-2 text-white transition hover:bg-rose-700 disabled:opacity-50"><X size={16} /></button></div> : !canReview && item.status === "pending" ? <button type="button" disabled={saving} onClick={() => cancelLeave(item._id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button> : <span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
  );
}

export default function LeavesPage() { return <AuthGuard><LeaveManagement /></AuthGuard>; }
