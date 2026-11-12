"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowUpRight, Banknote, Check, CheckCircle2,
  Clock3, CreditCard, Download, FileImage, FileText, IndianRupee,
  LoaderCircle, Plus, ReceiptText, RefreshCw, ShieldCheck, Upload,
  Wallet, X, XCircle,
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const categories = [
  { id: "travel", label: "Travel", color: "bg-blue-500", soft: "bg-blue-50 text-blue-700" },
  { id: "meals", label: "Meals", color: "bg-amber-500", soft: "bg-amber-50 text-amber-700" },
  { id: "equipment", label: "Equipment", color: "bg-violet-500", soft: "bg-violet-50 text-violet-700" },
] as const;

type Category = (typeof categories)[number]["id"];
type Employee = { _id: string; employeeCode: string; firstName: string; lastName: string; email: string };
type Claim = {
  _id: string; employee: Employee | string; category: Category; amount: number;
  expenseDate: string; merchant: string; description: string;
  receiptOriginalName: string; status: "pending" | "approved" | "rejected" | "reimbursed";
  overLimitAtSubmission?: boolean; reviewComment?: string; reimbursementReference?: string;
  createdAt: string; reviewedAt?: string; reimbursedAt?: string;
};
type Limit = { _id: string; category: Category; monthlyLimit: number; usedThisMonth: number };
type Workspace = {
  claims: Claim[]; limits: Limit[];
  summary: { totalReimbursed: number; pendingCount: number; approvedCount: number; totalClaims: number };
  corporateCard: { connected: boolean; provider: string | null };
};

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10";
const labelClass = "block text-sm font-semibold text-slate-700";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}
function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function employeeName(value: Claim["employee"]) {
  if (!value || typeof value === "string") return "Employee";
  return `${value.firstName} ${value.lastName}`;
}
function statusStyle(status: Claim["status"]) {
  if (status === "reimbursed") return "bg-emerald-50 text-emerald-700";
  if (status === "approved") return "bg-blue-50 text-blue-700";
  if (status === "rejected") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

function ExpenseContent() {
  const [role, setRole] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [category, setCategory] = useState<Category>("travel");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(localDate());
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

  const isAdmin = role === "admin" || role === "hr";
  const token = () => sessionStorage.getItem("hrms_token") || "";

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "");
      const result = await apiRequest("/expenses");
      const data = result.data as Workspace;
      setWorkspace(data);
      setLimitDrafts(Object.fromEntries(data.limits.map((item) => [item.category, String(item.monthlyLimit)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load expense workspace");
    } finally { setLoading(false); }
  }, [apiRequest]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const visibleClaims = useMemo(() => {
    const claims = workspace?.claims || [];
    return showLedger ? claims.filter((item) => item.status === "reimbursed") : claims;
  }, [workspace, showLedger]);

  const submitClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receipt) { setError("Please attach a receipt before submitting."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.append("category", category);
      body.append("amount", amount);
      body.append("expenseDate", expenseDate);
      body.append("merchant", merchant);
      body.append("description", description);
      body.append("receipt", receipt);
      const result = await apiRequest("/expenses/claims", { method: "POST", body });
      setMessage(result.message);
      setShowClaimForm(false);
      setAmount(""); setMerchant(""); setDescription(""); setReceipt(null); setExpenseDate(localDate());
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit claim");
    } finally { setBusy(false); }
  };

  const saveLimit = async (item: typeof categories[number]) => {
    const value = Number(limitDrafts[item.id]);
    if (!Number.isFinite(value) || value < 0) { setError("Enter a valid non-negative monthly limit."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/expenses/limits/${item.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyLimit: value }),
      });
      setMessage(result.message);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save category limit");
    } finally { setBusy(false); }
  };

  const reviewClaim = async (id: string, decision: "approved" | "rejected") => {
    if (decision === "rejected" && !window.confirm("Reject this expense claim?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/expenses/claims/${id}/review`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      setMessage(result.message);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review claim");
    } finally { setBusy(false); }
  };

  const reimburseClaim = async (id: string) => {
    const reference = window.prompt("Payment / UTR reference (optional):") || "";
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/expenses/claims/${id}/reimburse`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reimbursementReference: reference }),
      });
      setMessage(result.message);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark claim reimbursed");
    } finally { setBusy(false); }
  };

  const downloadReceipt = async (claim: Claim) => {
    setError("");
    try {
      const response = await fetch(`${API_URL}/expenses/claims/${claim._id}/receipt`, {
        headers: { Authorization: `Bearer ${token()}` }, cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Unable to download receipt");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = claim.receiptOriginalName || "receipt";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to download receipt"); }
  };

  const summary = workspace?.summary;
  const limitFor = (id: Category) => workspace?.limits.find((item) => item.category === id);

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-indigo-700"><ArrowLeft size={16} />Dashboard <span className="text-slate-300">/</span> Expense &amp; Reimbursement</Link>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-3 text-white shadow-lg shadow-indigo-600/20"><Wallet size={25} /></div>
              <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Expense &amp; Reimbursement</h1><p className="mt-1 text-sm text-slate-500">Submit expenses, track approvals and manage reimbursements.</p></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={loadWorkspace} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
            <button type="button" onClick={() => { setError(""); setShowClaimForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"><Plus size={17} />New Claim</button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
        {message && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 size={18} />{message}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="hrms-card hrms-enter rounded-2xl p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Total Reimbursed</span><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><IndianRupee size={19} /></div></div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{money(summary?.totalReimbursed || 0)}</p><p className="mt-1 text-xs text-slate-400">Successfully reimbursed claims</p>
          </article>
          <article className="hrms-card hrms-enter rounded-2xl p-5 [animation-delay:70ms]">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Pending Approval</span><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Clock3 size={19} /></div></div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{summary?.pendingCount || 0}</p><p className="mt-1 text-xs text-slate-400">Waiting for Admin / HR review</p>
          </article>
          <article className="hrms-card hrms-enter rounded-2xl p-5 [animation-delay:140ms]">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Approved to Pay</span><div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><CheckCircle2 size={19} /></div></div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{summary?.approvedCount || 0}</p><p className="mt-1 text-xs text-slate-400">Approved, awaiting reimbursement</p>
          </article>
          <article className="hrms-card hrms-enter rounded-2xl p-5 [animation-delay:210ms]">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">All Claims</span><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><ReceiptText size={19} /></div></div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{summary?.totalClaims || 0}</p><p className="mt-1 text-xs text-slate-400">Claims in this workspace</p>
          </article>
        </section>

        <section className="mb-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50 p-6 shadow-[0_18px_50px_rgba(79,70,229,0.08)]">
            <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><CreditCard size={18} />Virtual Corporate Card</div><h2 className="mt-3 text-xl font-bold text-slate-900">Company card integration</h2><p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Connect a supported corporate card provider to enable card transactions and live spend controls.</p></div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Not Connected</span>
            </div>
            <div className="relative mt-7 flex flex-wrap items-end justify-between gap-4 border-t border-indigo-100 pt-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Card status</p><p className="mt-1 text-sm font-semibold text-slate-700">No active card provider</p></div>
              <p className="text-xs text-slate-400">Card transactions are not included in expense totals.</p>
            </div>
          </article>

          <article className="hrms-card rounded-2xl p-6">
            <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Limit Breakdown</h2><p className="mt-1 text-xs text-slate-500">Monthly per-employee category limits</p></div><ShieldCheck size={21} className="text-indigo-600" /></div>
            <div className="space-y-5">
              {categories.map((item) => {
                const limit = limitFor(item.id);
                const used = limit?.usedThisMonth || 0;
                const percent = limit && limit.monthlyLimit > 0 ? Math.min(100, (used / limit.monthlyLimit) * 100) : 0;
                return <div key={item.id}>
                  <div className="mb-2 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${item.color}`} /><span className="text-sm font-semibold text-slate-700">{item.label}</span></div><span className="text-xs font-semibold text-slate-500">{limit ? `${money(used)} / ${money(limit.monthlyLimit)}` : "Not configured"}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${percent}%` }} /></div>
                  {isAdmin && <div className="mt-2 flex items-center gap-2"><label className="sr-only" htmlFor={`limit-${item.id}`}>{item.label} monthly limit</label><input id={`limit-${item.id}`} type="number" min="0" step="1" value={limitDrafts[item.id] ?? ""} onChange={(e) => setLimitDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))} placeholder="Set monthly limit (₹)" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400" /><button type="button" onClick={() => saveLimit(item)} disabled={busy || limitDrafts[item.id] === undefined || limitDrafts[item.id] === ""} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50">Save</button></div>}
                </div>;
              })}
            </div>
          </article>
        </section>

        {showClaimForm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-6 backdrop-blur-sm" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="new-claim-title" className="hrms-enter my-auto w-full max-w-2xl rounded-[26px] border border-white/80 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.24)] sm:p-8">
              <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Expense submission</p><h2 id="new-claim-title" className="mt-1 text-2xl font-bold text-slate-900">New Claim</h2><p className="mt-1 text-sm text-slate-500">Add expense details and attach the original receipt.</p></div><button type="button" onClick={() => setShowClaimForm(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={20} /></button></div>
              <form onSubmit={submitClaim} className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Expense category<select required value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label className={labelClass}>Amount (₹)<input required type="number" min="0.01" max="100000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter claim amount" className={inputClass} /></label>
                <label className={labelClass}>Expense date<input required type="date" max={localDate()} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={inputClass} /></label>
                <label className={labelClass}>Merchant / Vendor <span className="font-normal text-slate-400">(optional)</span><input maxLength={120} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Store or service provider" className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}>Business purpose / Description<textarea required maxLength={1000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explain the business purpose of this expense" className={`${inputClass} resize-y`} /></label>
                <div className="sm:col-span-2"><label className={labelClass}>Scan / Upload Receipt <span className="font-normal text-slate-400">(PDF, JPG, PNG · max 10 MB)</span></label><label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-5 py-7 text-center transition hover:border-indigo-400 hover:bg-indigo-50"><span className="mb-2 rounded-xl bg-white p-3 text-indigo-600 shadow-sm">{receipt ? <FileImage size={22} /> : <Upload size={22} />}</span><span className="text-sm font-bold text-slate-800">{receipt ? receipt.name : "Choose receipt file"}</span><span className="mt-1 text-xs text-slate-500">Attach a clear image or PDF of the receipt</span><input required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => setReceipt(e.target.files?.[0] || null)} /></label></div>
                <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5 sm:col-span-2"><button type="button" onClick={() => setShowClaimForm(false)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}{busy ? "Submitting..." : "Submit Claim"}</button></div>
              </form>
            </section>
          </div>
        )}

        <section className="hrms-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div><h2 className="text-lg font-bold text-slate-900">{showLedger ? "Reimbursement Ledger" : "Recent Claims"}</h2><p className="mt-1 text-sm text-slate-500">{showLedger ? "Claims recorded as reimbursed." : isAdmin ? "Review employee submissions and track payment status." : "Track your submitted expense claims."}</p></div>
            <button type="button" onClick={() => setShowLedger((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">{showLedger ? <ReceiptText size={16} /> : <Banknote size={16} />}{showLedger ? "Recent Claims" : "View Ledger"}<ArrowUpRight size={15} /></button>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />Loading expense records...</div> : visibleClaims.length === 0 ? <div className="px-5 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FileText size={22} /></div><h3 className="mt-3 font-bold text-slate-800">{showLedger ? "No reimbursed claims yet" : "No expense claims yet"}</h3><p className="mt-1 text-sm text-slate-500">{showLedger ? "Completed reimbursements will appear here." : "Submit a claim with its receipt to get started."}</p></div> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Claim / Employee</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleClaims.map((claim) => {
                  const categoryLabel = categories.find((item) => item.id === claim.category)?.label || claim.category;
                  return <tr key={claim._id} className="transition hover:bg-indigo-50/30">
                    <td className="px-5 py-4"><p className="font-semibold text-slate-800">{employeeName(claim.employee)}</p><p className="mt-1 max-w-[230px] truncate text-xs text-slate-400">{claim.merchant || claim.description}</p>{claim.overLimitAtSubmission && <span className="mt-1 inline-block text-[10px] font-bold text-amber-700">Over category limit at submission</span>}</td>
                    <td className="px-5 py-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{categoryLabel}</span></td>
                    <td className="px-5 py-4 text-slate-600">{new Date(claim.expenseDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-5 py-4 font-bold tabular-nums text-slate-900">{money(claim.amount)}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold capitalize ${statusStyle(claim.status)}`}>{claim.status}</span>{claim.reviewComment && <p className="mt-1 max-w-[150px] truncate text-[10px] text-slate-400" title={claim.reviewComment}>{claim.reviewComment}</p>}</td>
                    <td className="px-5 py-4"><div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => downloadReceipt(claim)} title="Download receipt" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-indigo-700"><Download size={16} /></button>
                      {isAdmin && claim.status === "pending" && <><button type="button" disabled={busy} onClick={() => reviewClaim(claim._id, "approved")} title="Approve" className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"><Check size={17} /></button><button type="button" disabled={busy} onClick={() => reviewClaim(claim._id, "rejected")} title="Reject" className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><X size={17} /></button></>}
                      {isAdmin && claim.status === "approved" && <button type="button" disabled={busy} onClick={() => reimburseClaim(claim._id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">Mark reimbursed</button>}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table></div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-400"><span>Showing up to 200 latest claims</span><span className="inline-flex items-center gap-1"><ShieldCheck size={13} />Private receipt access</span></div>
        </section>
        <p className="mt-4 text-center text-xs text-slate-400">Reimbursement is recorded by Admin / HR after the actual payment is made. This module does not initiate bank transfers.</p>
      </div>
    </main>
  );
}

export default function ExpensesPage() {
  return <AuthGuard><ExpenseContent /></AuthGuard>;
}
