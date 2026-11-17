"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, FileText, RefreshCw, Search, ShieldCheck, Wallet, CalendarDays, UserRound, X } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type ApprovalType = "leave" | "expense" | "employee-update";
type Approval = {
  id: string;
  type: ApprovalType;
  status: string;
  createdAt: string;
  employee: { id: string | null; employeeCode: string; name: string };
  details: Record<string, unknown>;
};

const TYPE_LABELS: Record<ApprovalType, string> = {
  leave: "Leave",
  expense: "Expense",
  "employee-update": "Employee update",
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

function ApprovalInboxContent() {
  const [items, setItems] = useState<Approval[]>([]);
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) throw new Error("Session expired. Please log in again.");
    const response = await fetch(API_URL + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      cache: "no-store",
    });
    if (response.status === 401) {
      sessionStorage.removeItem("hrms_token");
      sessionStorage.removeItem("hrms_user");
      window.location.replace("/login");
      throw new Error("Session expired. Please log in again.");
    }
    let result: { success?: boolean; message?: string; data?: Approval[] };
    try {
      result = await response.json();
    } catch {
      throw new Error("The server returned an invalid response. Please try again.");
    }
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request("/approvals?status=" + encodeURIComponent(status));
      setItems(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Unable to load approvals");
    } finally {
      setLoading(false);
    }
  }, [request, status]);

  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
    } catch { setRole("employee"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      if (!term) return true;
      return [item.employee.name, item.employee.employeeCode, TYPE_LABELS[item.type], ...Object.values(item.details).map(displayValue)]
        .join(" ").toLowerCase().includes(term);
    });
  }, [items, search, type]);

  const decide = async (item: Approval, decision: "approve" | "reject") => {
    const note = (notes[item.id] || "").trim();
    if (decision === "reject" && !note) {
      setError("Please enter a reason before rejecting this request.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      let path = "";
      let body: Record<string, string> = {};
      if (item.type === "leave") {
        path = "/leaves/" + item.id + "/review";
        body = { decision: decision === "approve" ? "approved" : "rejected", reviewComment: note };
      } else if (item.type === "expense") {
        path = "/expenses/claims/" + item.id + "/review";
        body = { decision: decision === "approve" ? "approved" : "rejected", reviewComment: note };
      } else {
        path = "/employee-update-approvals/" + item.id + "/decision";
        body = { decision, note };
      }
      const result = await request(path, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(result.message || "Decision saved.");
      setNotes((current) => ({ ...current, [item.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save decision");
    } finally {
      setBusyId("");
    }
  };

  const pendingCount = filtered.filter((item) => item.status === "pending").length;
  const canSeeCompanyRequests = role === "admin" || role === "hr";

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-700"><ShieldCheck size={14} /> HR workspace</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Approval Inbox</h1>
            <p className="mt-1 text-sm text-slate-500">Review pending requests from one place.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} /> Refresh</button>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Requests shown</p><p className="mt-1 text-2xl font-bold text-slate-900">{loading ? "…" : filtered.length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Pending in view</p><p className="mt-1 text-2xl font-bold text-amber-600">{loading ? "…" : pendingCount}</p></div>
          <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-1"><p className="text-xs text-slate-500">Approval scope</p><p className="mt-1 text-sm font-semibold text-slate-800">{role === "manager" ? "Assigned team leave" : "Company approvals"}</p></div>
        </section>

        {error && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select>
              <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">All request types</option><option value="leave">Leave</option>
                {canSeeCompanyRequests && <><option value="expense">Expense</option><option value="employee-update">Employee update</option></>}
              </select>
            </div>
            <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or request" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></div>
          </div>

          {loading ? <div className="py-14 text-center text-sm text-slate-500">Loading approvals…</div> :
            filtered.length === 0 ? <div className="py-14 text-center"><FileText size={28} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No requests found</p><p className="mt-1 text-xs text-slate-500">Requests matching these filters will appear here.</p></div> :
            <div className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const pending = item.status === "pending";
                const icon = item.type === "leave" ? CalendarDays : item.type === "expense" ? Wallet : UserRound;
                const Icon = icon;
                const detailRows = Object.entries(item.details).filter(([key]) => !["reviewComment", "decisionNote"].includes(key));
                return <article key={item.type + item.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={17} /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{TYPE_LABELS[item.type]}</h3><span className={"rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " + (pending ? "bg-amber-50 text-amber-700" : item.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{item.status}</span></div>
                        <p className="mt-1 text-sm text-slate-700">{item.employee.name} <span className="text-slate-400">· {item.employee.employeeCode || "No employee code"}</span></p>
                        <p className="mt-0.5 text-xs text-slate-400">Submitted {new Date(item.createdAt).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                    {item.type === "expense" && <p className="text-base font-bold text-slate-900">₹{Number(item.details.amount || 0).toLocaleString("en-IN")}</p>}
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {detailRows.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-slate-400">{key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</dt><dd className="mt-0.5 break-words font-medium text-slate-700">{displayValue(value)}</dd></div>)}
                  </dl>
                  {pending && <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input value={notes[item.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Decision note (required for rejection)" className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-400" />
                    <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, "approve")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={14} /> Approve</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, "reject")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X size={14} /> Reject</button>
                  </div>}
                </article>;
              })}
            </div>}
        </section>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 size={12} /> Expense reimbursement remains in the Expenses module after approval.</p>
      </div>
    </main>
  );
}

export default function ApprovalInboxPage() {
  return <AuthGuard><ApprovalInboxContent /></AuthGuard>;
}
