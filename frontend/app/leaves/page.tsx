"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, RefreshCw, Send, Check, X, ArrowLeft } from "lucide-react";
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

function LeaveManagement() {
  const router = useRouter();
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    leaveType: "casual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const isReviewer = role === "admin" || role === "hr";

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
      const query = isReviewer && filter !== "all"
        ? `?status=${encodeURIComponent(filter)}`
        : "";
      const result = await request(`/leaves${query}`);
      setItems(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [filter, isReviewer, request]);

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
      await loadLeaves();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit leave request");
    } finally {
      setSaving(false);
    }
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

  const statusClass = (status: LeaveStatus) => {
    if (status === "approved") return "bg-green-100 text-green-700";
    if (status === "rejected") return "bg-red-100 text-red-700";
    if (status === "cancelled") return "bg-slate-100 text-slate-600";
    return "bg-amber-100 text-amber-700";
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">Leave Management</h1>
            <p className="mt-2 text-slate-500">
              {isReviewer ? "Review and manage company leave requests." : "Apply for leave and track your requests."}
            </p>
          </div>
          <button type="button" onClick={loadLeaves} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={17} /> Refresh
          </button>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        {(
          <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-3"><CalendarDays size={23} className="text-blue-600" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Apply for Leave</h2>
                <p className="text-sm text-slate-500">Leave days use the employee's assigned shift weekly offs and active public/company holidays. Optional holidays are not deducted.</p>
              </div>
            </div>
            <form onSubmit={submitLeave} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Leave Type *</label>
                <select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                  <option value="casual">Casual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="earned">Earned Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Start Date *</label>
                <input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">End Date *</label>
                <input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason *</label>
                <textarea required minLength={5} maxLength={1000} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Enter reason for leave" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </div>
              <div className="md:col-span-2">
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  <Send size={17} /> {saving ? "Submitting..." : "Submit Leave Request"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-900">{isReviewer ? "Company Leave Register" : "My Leave History"}</h2>
            {isReviewer && (
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="all">All Requests</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>

          {loading ? (
            <p className="py-10 text-center text-slate-500">Loading leave requests...</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-slate-500">No leave requests found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600">
                  <tr>
                    {isReviewer && <th className="px-4 py-3 font-semibold">Employee</th>}
                    <th className="px-4 py-3 font-semibold">Leave Type</th>
                    <th className="px-4 py-3 font-semibold">From</th>
                    <th className="px-4 py-3 font-semibold">To</th>
                    <th className="px-4 py-3 font-semibold">Days</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50">
                      {isReviewer && (
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">{item.employee?.firstName} {item.employee?.lastName}</p>
                          <p className="text-xs text-slate-500">{item.employee?.employeeCode}</p>
                        </td>
                      )}
                      <td className="px-4 py-4 capitalize">{item.leaveType}</td>
                      <td className="px-4 py-4">{item.startDate}</td>
                      <td className="px-4 py-4">{item.endDate}</td>
                      <td className="px-4 py-4">{item.totalDays}</td>
                      <td className="max-w-xs whitespace-normal px-4 py-4">{item.reason}</td>
                      <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(item.status)}`}>{item.status}</span>{item.reviewComment && <p className="mt-2 text-xs text-slate-500">{item.reviewComment}</p>}</td>
                      <td className="px-4 py-4">
                        {isReviewer && item.status === "pending" ? (
                          <div className="flex gap-2">
                            <button type="button" disabled={saving} onClick={() => reviewLeave(item._id, "approved")} title="Approve" className="rounded-lg bg-green-600 p-2 text-white hover:bg-green-700 disabled:opacity-50"><Check size={16} /></button>
                            <button type="button" disabled={saving} onClick={() => reviewLeave(item._id, "rejected")} title="Reject" className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700 disabled:opacity-50"><X size={16} /></button>
                          </div>
                        ) : !isReviewer && item.status === "pending" ? (
                          <button type="button" disabled={saving} onClick={() => cancelLeave(item._id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="mt-4 text-xs text-slate-500">Leave requests are reviewed by Admin or HR. Leave days currently use calendar-day counting; weekly offs and holidays are not deducted.</p>
      </div>
    </main>
  );
}

export default function LeavesPage() {
  return <AuthGuard><LeaveManagement /></AuthGuard>;
}
