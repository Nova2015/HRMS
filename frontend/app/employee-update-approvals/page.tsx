"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FileText, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";
type ApprovalRequest = {
  _id: string; employeeCode: string;
  employee?: { firstName: string; lastName: string } | null;
  source: "gmail" | "document" | "manual"; sourceReference?: string; sourceSubject?: string;
  proposedChanges: Record<string, unknown>; oldValues?: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected"; requestedBy?: { email?: string } | null;
  decidedBy?: { email?: string } | null; decidedAt?: string | null; decisionNote?: string; createdAt: string;
};
const LABELS: Record<string, string> = {
  firstName: "First name", lastName: "Last name", phone: "Phone", department: "Department",
  designation: "Designation", shift: "Shift", reportingManager: "Reporting manager",
  joiningDate: "Joining date", employmentStatus: "Employment status",
};
function showValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("en-IN");
  }
  return String(value);
}

function ApprovalQueue() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmTarget, setConfirmTarget] = useState<{ request: ApprovalRequest; decision: "approve" | "reject" } | null>(null);
  const [animationMode, setAnimationMode] = useState<"cinematic" | "flip" | "hologram" | "slide">("cinematic");

  const playUiSound = (kind: "open" | "approve" | "reject" | "error") => {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const now = audio.currentTime;
      const tones = kind === "open" ? [660, 880] : kind === "approve" ? [660, 880, 1100] : kind === "reject" ? [440, 330] : [220, 180];
      tones.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.095);
        gain.gain.setValueAtTime(0.0001, now + index * 0.095);
        gain.gain.exponentialRampToValueAtTime(0.075, now + index * 0.095 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.095 + 0.12);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(now + index * 0.095);
        oscillator.stop(now + index * 0.095 + 0.13);
      });
      window.setTimeout(() => { void audio.close(); }, 700);
    } catch { /* Audio is an enhancement; decisions must work without it. */ }
  };

  const loadRequests = useCallback(async () => {
    setLoading(true); setError("");
    const token = sessionStorage.getItem("hrms_token");
    if (!token) { setError("Session expired. Please log in again."); setLoading(false); return; }
    try {
      const response = await fetch(API_URL + "/employee-update-approvals?status=" + status, {
        headers: { Authorization: "Bearer " + token }, cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user");
        window.location.href = "/login"; return;
      }
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load approval requests");
      setRequests(Array.isArray(result.data) ? result.data : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load approval requests"); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  useEffect(() => {
    const applyMode = (value: string | null) => {
      if (value === "cinematic" || value === "flip" || value === "hologram" || value === "slide") setAnimationMode(value);
    };
    applyMode(window.localStorage.getItem("hrms_approval_animation_mode"));
    const changed = (event: Event) => applyMode((event as CustomEvent<string>).detail);
    window.addEventListener("hrms-animation-mode-changed", changed);
    window.addEventListener("storage", event => { if (event.key === "hrms_approval_animation_mode") applyMode(event.newValue); });
    return () => window.removeEventListener("hrms-animation-mode-changed", changed);
  }, []);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requests;
    return requests.filter((r) =>
      ((r.employee?.firstName || "") + " " + (r.employee?.lastName || "")).toLowerCase().includes(term) ||
      r.employeeCode.toLowerCase().includes(term) || r.source.toLowerCase().includes(term) ||
      (r.sourceSubject || "").toLowerCase().includes(term)
    );
  }, [requests, search]);

  const openDecisionConfirm = (request: ApprovalRequest, decision: "approve" | "reject") => {
    if (decision === "reject" && !notes[request._id]?.trim()) {
      setError("Enter a rejection reason in the decision note field."); return;
    }
    setError("");
    setConfirmTarget({ request, decision });
    playUiSound("open");
  };

  const decide = async () => {
    if (!confirmTarget) return;
    const { request, decision } = confirmTarget;
    if (decision === "reject" && !notes[request._id]?.trim()) {
      setError("Enter a rejection reason in the decision note field."); return;
    }
    setBusyId(request._id); setError(""); setNotice("");
    try {
      const token = sessionStorage.getItem("hrms_token");
      const response = await fetch(API_URL + "/employee-update-approvals/" + request._id + "/decision", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ decision, note: notes[request._id] || "" }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to process decision");
      setNotice(result.message || "Decision saved.");
      setConfirmTarget(null);
      playUiSound(decision);
      await loadRequests();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to process decision"); playUiSound("error"); }
    finally { setBusyId(""); }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><ArrowLeft size={16} /> Back to Dashboard</Link>
            <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700"><ShieldCheck size={15} /> HR control center</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Employee Update Approvals</h1>
            <p className="mt-2 text-sm text-slate-500">Review proposed employee record changes from Gmail, documents and manual submissions.</p>
          </div>
          <button type="button" onClick={loadRequests} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Requests shown</p><p className="mt-2 text-3xl font-bold text-slate-900">{loading ? "…" : requests.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Pending approvals</p><p className="mt-2 text-3xl font-bold text-amber-600">{loading ? "…" : pendingCount}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Approval authority</p><p className="mt-2 text-lg font-bold text-slate-900">HR or Admin</p><p className="mt-1 text-xs text-slate-500">One authorized decision is sufficient.</p></div>
        </section>
        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">Approval queue</h2><p className="mt-1 text-sm text-slate-500">Compare current and proposed values before deciding.</p></div>
            <div className="flex flex-wrap gap-2">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All requests</option></select>
              <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or source" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm sm:w-64" /></div>
            </div>
          </div>
          {loading ? <div className="py-14 text-center text-sm text-slate-500">Loading approval requests…</div> :
            filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-5 py-14 text-center"><FileText size={30} className="mx-auto text-slate-300" /><h3 className="mt-3 font-semibold text-slate-800">No {status === "all" ? "" : status} requests found</h3><p className="mt-1 text-sm text-slate-500">New employee update proposals will appear here for HR/Admin review.</p></div> :
            <div className="space-y-4">{filtered.map((r) => {
              const name = r.employee ? r.employee.firstName + " " + r.employee.lastName : "Employee record";
              const pending = r.status === "pending";
              return <article key={r._id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{name}</h3><p className="mt-1 text-xs text-slate-500">{r.employeeCode} · Submitted {new Date(r.createdAt).toLocaleString("en-IN")}</p><div className="mt-2 flex gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">{r.source}</span><span className={"rounded-full px-2.5 py-1 text-xs font-semibold capitalize " + (r.status === "pending" ? "bg-amber-50 text-amber-700" : r.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{r.status}</span></div></div>{r.sourceReference && <p className="max-w-xs break-all text-xs text-slate-400">Reference: {r.sourceReference}</p>}</div>
                {r.sourceSubject && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Source subject: {r.sourceSubject}</p>}
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Field</th><th className="px-4 py-3">Current value</th><th className="px-4 py-3">Proposed value</th></tr></thead><tbody className="divide-y divide-slate-100">{Object.entries(r.proposedChanges || {}).map(([field, value]) => <tr key={field}><td className="px-4 py-3 font-semibold text-slate-700">{LABELS[field] || field}</td><td className="px-4 py-3 text-slate-500">{r.oldValues && field in r.oldValues ? showValue(r.oldValues[field]) : "Not captured"}</td><td className="px-4 py-3 font-semibold text-blue-700">{showValue(value)}</td></tr>)}</tbody></table></div>
                {r.requestedBy?.email && <p className="mt-3 text-xs text-slate-500">Submitted by {r.requestedBy.email}</p>}
                {!pending && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><p>Decision: <strong className="capitalize">{r.status}</strong>{r.decidedBy?.email ? " by " + r.decidedBy.email : ""}{r.decidedAt ? " · " + new Date(r.decidedAt).toLocaleString("en-IN") : ""}</p>{r.decisionNote && <p className="mt-1">Note: {r.decisionNote}</p>}</div>}
                {pending && <div className="mt-4 border-t border-slate-100 pt-4"><label htmlFor={"note-" + r._id} className="mb-1.5 block text-xs font-semibold text-slate-600">Decision note (required for rejection)</label><textarea id={"note-" + r._id} value={notes[r._id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [r._id]: e.target.value }))} rows={2} maxLength={1000} placeholder="Add context for this decision…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={busyId === r._id} onClick={() => openDecisionConfirm(r, "reject")} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X size={16} /> Reject</button><button type="button" disabled={busyId === r._id} onClick={() => openDecisionConfirm(r, "approve")} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={16} /> Approve & Apply</button></div></div>}
              </article>;
            })}</div>}
        </section>
        {confirmTarget && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setConfirmTarget(null); }}>
          <style>{`
            @keyframes approvalBackdropIn { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; backdrop-filter: blur(12px); } }
            @keyframes approval3DEntrance { 0% { opacity: 0; transform: perspective(1400px) translateY(70px) rotateX(22deg) rotateY(-9deg) scale(.82); } 65% { opacity: 1; transform: perspective(1400px) translateY(-8px) rotateX(-3deg) rotateY(2deg) scale(1.015); } 100% { opacity: 1; transform: perspective(1400px) translateY(0) rotateX(0) rotateY(0) scale(1); } }
            @keyframes approvalIconPulse { 0%, 100% { transform: translateZ(22px) rotateY(-8deg) scale(1); } 50% { transform: translateZ(42px) rotateY(12deg) scale(1.1); } }
            @keyframes approvalOrbit { from { transform: rotateX(68deg) rotateZ(0deg); } to { transform: rotateX(68deg) rotateZ(360deg); } }
            @keyframes approvalFloat { 0%, 100% { transform: translate3d(0,0,0) rotate(0deg); } 50% { transform: translate3d(0,-13px,18px) rotate(8deg); } }
            @keyframes approvalShine { 0% { transform: translateX(-160%) skewX(-20deg); } 100% { transform: translateX(260%) skewX(-20deg); } }
            @keyframes approvalGlow { 0%,100% { opacity:.42; transform:scale(.94); } 50% { opacity:.9; transform:scale(1.08); } }
            @keyframes approvalFlipIn { 0% { opacity:0; transform:perspective(1400px) rotateY(88deg) scale(.82); } 70% { opacity:1; transform:perspective(1400px) rotateY(-8deg) scale(1.02); } 100% { opacity:1; transform:perspective(1400px) rotateY(0) scale(1); } }
            @keyframes approvalHoloIn { 0% { opacity:0; filter:blur(16px) hue-rotate(90deg); transform:perspective(1400px) rotateX(24deg) rotateY(-18deg) scale(.86); } 65% { opacity:1; filter:blur(0) hue-rotate(-12deg); transform:perspective(1400px) rotateX(-5deg) rotateY(5deg) scale(1.025); } 100% { opacity:1; filter:blur(0) hue-rotate(0); transform:perspective(1400px) rotateX(0) rotateY(0) scale(1); } }
            @keyframes approvalSlideIn { 0% { opacity:0; transform:perspective(1200px) translate3d(100px,35px,-120px) rotateY(-16deg) scale(.9); } 70% { opacity:1; transform:perspective(1200px) translate3d(-8px,-4px,12px) rotateY(2deg) scale(1.01); } 100% { opacity:1; transform:perspective(1200px) translate3d(0,0,0) rotateY(0) scale(1); } }
            .approval-3d-scene { perspective: 1600px; perspective-origin: 50% 42%; }
            .approval-3d-card { position:relative; transform-style:preserve-3d; will-change:transform; box-shadow:0 45px 100px -28px rgba(2,6,23,.72),0 18px 35px -18px rgba(2,6,23,.5),inset 0 1px 0 rgba(255,255,255,.85); }
            .approval-3d-card:before { content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(255,255,255,.12),rgba(148,163,184,.55));-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none; }
            .approval-3d-card:after { content:"";position:absolute;inset:10px;border-radius:22px;border:1px solid rgba(148,163,184,.13);transform:translateZ(-8px);pointer-events:none; }
            .approval-3d-shine { position:absolute;inset:-30% auto -30% -35%;width:34%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);animation:approvalShine 4.8s ease-in-out infinite;pointer-events:none; }
            @media (prefers-reduced-motion: reduce) { .approval-3d-card,.approval-3d-shine { animation:none !important; } }
          `}</style>
          <div className="approval-3d-scene w-full max-w-lg">
          <section role="dialog" aria-modal="true" aria-labelledby="approval-confirm-title" className="approval-3d-card w-full overflow-hidden rounded-[30px] border border-white/70 bg-white" style={{ animation: (animationMode === "cinematic" ? "approval3DEntrance .82s cubic-bezier(.16,1,.3,1)" : animationMode === "flip" ? "approvalFlipIn .78s cubic-bezier(.16,1,.3,1)" : animationMode === "hologram" ? "approvalHoloIn .95s cubic-bezier(.16,1,.3,1)" : "approvalSlideIn .78s cubic-bezier(.16,1,.3,1)") + " both" }}>
            <div className={`relative isolate overflow-hidden px-6 pb-8 pt-8 text-white ${confirmTarget.decision === "approve" ? "bg-gradient-to-br from-[#052e2b] via-emerald-700 to-cyan-700" : "bg-gradient-to-br from-[#3b0714] via-rose-700 to-orange-700"}`}>
              <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10" style={{ transform: "translateZ(-24px)", animation: "approvalFloat 7s ease-in-out infinite" }} />
              <div className="absolute -right-5 -top-14 h-52 w-52 rounded-full border-[24px] border-white/[0.06]" style={{ animation: "approvalGlow 4s ease-in-out infinite" }} />
              <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
              <div className="approval-3d-shine" />
              <div className="relative flex items-center gap-5" style={{ transformStyle: "preserve-3d" }}>
                <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[22px] border border-white/30 bg-white/15 shadow-[0_18px_38px_-12px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.45)] backdrop-blur-xl" style={{ transform: "translateZ(34px) rotateY(-9deg) rotateX(7deg)", animation: "approvalIconPulse 3.2s ease-in-out infinite" }}>
                  <div className="absolute -inset-3 rounded-[28px] border border-white/25" style={{ animation: "approvalOrbit 9s linear infinite" }} />
                  <div className="absolute inset-1 rounded-[17px] border border-white/15" />
                  {confirmTarget.decision === "approve" ? <ShieldCheck size={36} strokeWidth={1.8} /> : <X size={36} strokeWidth={2} />}
                </div>
                <div><p className="text-xs font-bold uppercase tracking-[.18em] text-white/75">Final confirmation</p><h2 id="approval-confirm-title" className="mt-1 text-2xl font-extrabold">{confirmTarget.decision === "approve" ? "Approve update?" : "Reject update?"}</h2></div>
              </div>
            </div>
            <div className="relative p-6 sm:p-7" style={{ transform: "translateZ(16px)" }}>
              <p className="text-sm leading-6 text-slate-600">{confirmTarget.decision === "approve" ? "This will apply the proposed values to the employee record. Review the change before continuing." : "This will mark the proposal as rejected. The employee record will remain unchanged."}</p>
              <div className="mt-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-[inset_0_1px_3px_rgba(15,23,42,.05),0_8px_20px_-15px_rgba(15,23,42,.3)]" style={{ transform: "translateZ(12px)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</p>
                <p className="mt-1 font-bold text-slate-900">{confirmTarget.request.employee ? confirmTarget.request.employee.firstName + " " + confirmTarget.request.employee.lastName : "Employee record"}</p>
                <p className="text-xs text-slate-500">{confirmTarget.request.employeeCode}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{confirmTarget.request.sourceSubject || "Employee update"}</p>
              </div>
              {confirmTarget.decision === "reject" && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">Reason: {notes[confirmTarget.request._id]}</p>}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={!!busyId} onClick={() => setConfirmTarget(null)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Go back</button>
                <button type="button" disabled={!!busyId} onClick={() => void decide()} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 ${confirmTarget.decision === "approve" ? "bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700" : "bg-rose-600 shadow-rose-600/20 hover:bg-rose-700"}`}>
                  {busyId ? <RefreshCw size={16} className="animate-spin" /> : confirmTarget.decision === "approve" ? <Check size={16} /> : <X size={16} />}
                  {busyId ? "Processing…" : confirmTarget.decision === "approve" ? "Yes, approve" : "Yes, reject"}
                </button>
              </div>
              <p className="mt-4 text-center text-[11px] text-slate-400">A short confirmation sound plays when supported by your browser.</p>
            </div>
          </section>
          </div>
        </div>}
        <p className="mt-4 text-xs text-slate-400">Sensitive identifiers and login credentials are excluded from external update approvals.</p>
      </div>
    </main>
  );
}
export default function EmployeeUpdateApprovalsPage() { return <AuthGuard><ApprovalQueue /></AuthGuard>; }
