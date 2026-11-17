"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
  const [confirmTarget, setConfirmTarget] = useState<{ item: Approval; decision: "approve" | "reject" } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

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
      const currentRole = user.role || "employee";
      setRole(currentRole);
      if (!["admin", "hr", "manager"].includes(currentRole)) router.replace("/");
    } catch {
      setRole("employee");
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    if (["admin", "hr", "manager"].includes(role)) void load();
  }, [load, role]);

  useEffect(() => {
    const appShell = document.querySelector<HTMLElement>(".hrms-app-shell");
    if (!appShell) return;
    appShell.inert = !!confirmTarget;
    return () => { appShell.inert = false; };
  }, [confirmTarget]);

  useEffect(() => {
    if (!confirmTarget) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [confirmTarget]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      if (!term) return true;
      return [item.employee.name, item.employee.employeeCode, TYPE_LABELS[item.type], ...Object.values(item.details).map(displayValue)]
        .join(" ").toLowerCase().includes(term);
    });
  }, [items, search, type]);

  const openDecisionConfirm = (item: Approval, decision: "approve" | "reject") => {
    if (decision === "reject" && !(notes[item.id] || "").trim()) {
      setError("Please enter a reason before rejecting this request.");
      return;
    }
    setError("");
    setConfirmTarget({ item, decision });
  };

  const decide = async () => {
    if (!confirmTarget) return;
    const { item, decision } = confirmTarget;
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
      setConfirmTarget(null);
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
              <select aria-label="Filter by approval status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select>
              <select aria-label="Filter by request type" value={type} onChange={(event) => setType(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">All request types</option><option value="leave">Leave</option>
                {canSeeCompanyRequests && <><option value="expense">Expense</option><option value="employee-update">Employee update</option></>}
              </select>
            </div>
            <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Search employee or request" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or request" className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-500" /></div>
          </div>

          {loading ? <div className="py-14 text-center text-sm text-slate-500">Loading approvals…</div> :
            filtered.length === 0 ? <div className="py-14 text-center"><FileText size={28} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No requests found</p><p className="mt-1 text-xs text-slate-500">Requests matching these filters will appear here.</p></div> :
            <div className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const pending = item.status === "pending";
                const icon = item.type === "leave" ? CalendarDays : item.type === "expense" ? Wallet : UserRound;
                const Icon = icon;
                const detailRows = Object.entries(item.details).filter(([key]) =>
                  !["reviewComment", "decisionNote", "proposedChanges", "oldValues", "source", "sourceReference", "sourceSubject", "requestedBy", "decidedBy", "decidedAt"].includes(key)
                );
                const proposedChanges = item.type === "employee-update" && item.details.proposedChanges && typeof item.details.proposedChanges === "object"
                  ? item.details.proposedChanges as Record<string, unknown> : {};
                const oldValues = item.type === "employee-update" && item.details.oldValues && typeof item.details.oldValues === "object"
                  ? item.details.oldValues as Record<string, unknown> : {};
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
                  {item.type === "employee-update" ? <>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Source: <strong className="font-semibold capitalize text-slate-700">{displayValue(item.details.source)}</strong></span>
                      {item.details.sourceReference ? <span className="break-all">Reference: {displayValue(item.details.sourceReference)}</span> : null}
                      {item.details.requestedBy ? <span>Submitted by: {displayValue(item.details.requestedBy)}</span> : null}
                    </div>
                    {item.details.sourceSubject ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{displayValue(item.details.sourceSubject)}</p> : null}
                    <div role="region" aria-label="Current and proposed employee values" tabIndex={0} className="mt-3 overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                      <table className="w-full min-w-[480px] text-left text-xs"><caption className="sr-only">Comparison of current and proposed employee values</caption>
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">Current value</th><th className="px-3 py-2">Proposed value</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(proposedChanges).map(([field, value]) => <tr key={field}><td className="px-3 py-2 font-semibold text-slate-700">{field.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</td><td className="px-3 py-2 text-slate-500">{field in oldValues ? displayValue(oldValues[field]) : "Not captured"}</td><td className="px-3 py-2 font-semibold text-indigo-700">{displayValue(value)}</td></tr>)}
                          {Object.keys(proposedChanges).length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center text-slate-400">No proposed field changes found.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    {!pending ? <p className="mt-2 text-xs text-slate-500">Decision: <strong className="capitalize text-slate-700">{item.status}</strong>{item.details.decidedBy ? " by " + displayValue(item.details.decidedBy) : ""}{item.details.decidedAt ? " · " + new Date(String(item.details.decidedAt)).toLocaleString("en-IN") : ""}{item.details.decisionNote ? <span className="block mt-1">Note: {displayValue(item.details.decisionNote)}</span> : null}</p> : null}
                  </> : <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {detailRows.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-slate-400">{key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</dt><dd className="mt-0.5 break-words font-medium text-slate-700">{displayValue(value)}</dd></div>)}
                  </dl>}
                  {pending && <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input aria-label={"Decision note for " + TYPE_LABELS[item.type] + " request by " + item.employee.name} value={notes[item.id] || ""} maxLength={1000} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Decision note (required for rejection)" className="min-h-11 w-full min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-500 sm:min-w-[220px]" />
                    <button type="button" disabled={busyId === item.id} onClick={() => openDecisionConfirm(item, "approve")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 sm:flex-none"><Check size={14} /> Approve</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => openDecisionConfirm(item, "reject")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:opacity-50 sm:flex-none"><X size={14} /> Reject</button>
                  </div>}
                </article>;
              })}
            </div>}
        </section>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 size={12} /> Expense reimbursement remains in the Expenses module after approval.</p>
      </div>
      {confirmTarget && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setConfirmTarget(null); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="approval-confirm-title" aria-describedby="approval-confirm-description" onKeyDown={(event) => { if (event.key === "Escape" && !busyId) { event.preventDefault(); setConfirmTarget(null); } if (event.key === "Tab") { const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'); if (!focusable?.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="approval-confirm-title" className="text-base font-bold text-slate-900">{confirmTarget.decision === "approve" ? "Confirm approval" : "Confirm rejection"}</h2>
            <p id="approval-confirm-description" className="mt-2 text-sm text-slate-600">{confirmTarget.decision === "approve"
              ? confirmTarget.item.type === "employee-update"
                ? "This will approve the proposed changes and apply them to the employee record."
                : confirmTarget.item.type === "leave"
                  ? "This will approve the employee’s leave request."
                  : "This will approve the expense claim. Reimbursement remains a separate action in the Expenses module."
              : confirmTarget.item.type === "employee-update"
                ? "This will reject the proposed changes. The employee record will remain unchanged."
                : confirmTarget.item.type === "leave"
                  ? "This will reject the employee’s leave request."
                  : "This will reject the expense claim."}</p>
            {confirmTarget.decision === "reject" ? <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Reason: {notes[confirmTarget.item.id]}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelButtonRef} type="button" disabled={!!busyId} onClick={() => setConfirmTarget(null)} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">Cancel</button>
              <button type="button" disabled={!!busyId} onClick={() => void decide()} className={"min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 " + (confirmTarget.decision === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700")}>{busyId ? "Processing…" : confirmTarget.decision === "approve" ? "Yes, approve" : "Yes, reject"}</button>
            </div>
          </section>
        </div>, document.body)}

    </main>
  );
}

export default function ApprovalInboxPage() {
  return <AuthGuard><ApprovalInboxContent /></AuthGuard>;
}
