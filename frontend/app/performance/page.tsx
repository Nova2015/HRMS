"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Award, RefreshCw, CalendarDays, Send, CheckCircle2, Users } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
const labelClass = "block text-sm font-semibold text-slate-700";

type Review = {
  _id: string;
  period: string;
  status: "pending" | "self_submitted" | "manager_reviewed" | "finalized";
  employee: {
    _id: string; employeeCode: string; firstName: string; lastName: string;
    department?: { name: string }; designation?: { name: string };
  };
  selfReview: { goals: string; achievements: string; strengths: string; improvements: string };
  managerReview: { rating: number | null; comments: string };
};

function PerformanceContent() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [role, setRole] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-H2`);
  const [selectedId, setSelectedId] = useState("");
  const [goals, setGoals] = useState("");
  const [achievements, setAchievements] = useState("");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [rating, setRating] = useState("3");
  const [comments, setComments] = useState("");
  const [finalize, setFinalize] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const token = () => sessionStorage.getItem("hrms_token") || "";
  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, []);

  const loadReviews = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
      setEmployeeId(user.employeeId || user.employee?._id || "");
      const result = await apiRequest("/performance");
      setReviews(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load performance reviews");
    } finally { setLoading(false); }
  }, [apiRequest]);

  useEffect(() => { void Promise.resolve().then(loadReviews); }, [loadReviews]);

  const selected = reviews.find((item) => item._id === selectedId) || null;
  const isAdmin = role === "admin" || role === "hr";

  const createCycle = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest("/performance/cycles", { method: "POST", body: JSON.stringify({ period }) });
      setMessage(result.message);
      await loadReviews();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create review cycle"); }
    finally { setBusy(false); }
  };

  const openReview = (review: Review) => {
    setSelectedId(review._id);
    setGoals(review.selfReview?.goals || "");
    setAchievements(review.selfReview?.achievements || "");
    setStrengths(review.selfReview?.strengths || "");
    setImprovements(review.selfReview?.improvements || "");
    setRating(String(review.managerReview?.rating || 3));
    setComments(review.managerReview?.comments || "");
    setFinalize(false);
    setError(""); setMessage("");
  };

  const submitSelfReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/performance/${selected._id}/self-review`, {
        method: "PUT", body: JSON.stringify({ goals, achievements, strengths, improvements }),
      });
      setMessage(result.message); setSelectedId(""); await loadReviews();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit self-review"); }
    finally { setBusy(false); }
  };

  const submitManagerReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/performance/${selected._id}/manager-review`, {
        method: "PUT", body: JSON.stringify({ rating: Number(rating), comments, finalize }),
      });
      setMessage(result.message); setSelectedId(""); await loadReviews();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save manager review"); }
    finally { setBusy(false); }
  };

  const statusLabel: Record<Review["status"], string> = {
    pending: "Awaiting self-review", self_submitted: "Awaiting manager review",
    manager_reviewed: "Manager review saved", finalized: "Finalized",
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700"><ArrowLeft size={16} />Dashboard</Link>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-500 p-3 text-white shadow-lg shadow-amber-500/20"><Award size={25} /></div>
              <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Performance Management</h1><p className="mt-1 text-sm text-slate-500">Self-assessment, manager feedback and review history.</p></div>
            </div>
          </div>
          <button type="button" onClick={loadReviews} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-blue-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
        </header>

        {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</div>}

        {isAdmin && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><CalendarDays size={19} className="text-blue-600" /><h2 className="font-bold text-slate-900">Create review cycle</h2></div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1"><span className={labelClass}>Review period</span><select value={period} onChange={(event) => setPeriod(event.target.value)} className={inputClass}><option value={`${new Date().getFullYear()}-H1`}>{new Date().getFullYear()} · First half</option><option value={`${new Date().getFullYear()}-H2`}>{new Date().getFullYear()} · Second half</option><option value={`${new Date().getFullYear()}-ANNUAL`}>{new Date().getFullYear()} · Annual</option></select></label>
            <button type="button" onClick={createCycle} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"><CalendarDays size={16} />Create cycle</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Creates a review record for every active employee. Existing reviews for the same period are preserved.</p>
        </section>}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Review records</p><p className="mt-2 text-2xl font-bold text-slate-900">{reviews.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Pending self-review</p><p className="mt-2 text-2xl font-bold text-amber-600">{reviews.filter((item) => item.status === "pending").length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Finalized</p><p className="mt-2 text-2xl font-bold text-emerald-600">{reviews.filter((item) => item.status === "finalized").length}</p></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Review workspace</h2><p className="mt-1 text-sm text-slate-500">{isAdmin ? "All active employee reviews" : role === "manager" ? "Your reviews and assigned team" : "Your performance reviews"}</p></div><Users size={20} className="text-slate-400" /></div>
          {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading reviews...</p> : reviews.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">No review cycles available yet. Ask HR to create a review cycle.</div> : <div className="space-y-3">
            {reviews.map((review) => {
              const ownReview = review.employee?._id === employeeId;
              const canManagerReview = (isAdmin || role === "manager") && !ownReview && ["self_submitted", "manager_reviewed"].includes(review.status);
              const canSelfReview = ownReview && ["pending", "self_submitted"].includes(review.status);
              return <div key={review._id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="min-w-[220px] flex-1">
                  <p className="font-semibold text-slate-900">{review.employee?.firstName} {review.employee?.lastName} <span className="ml-1 text-xs font-medium text-slate-400">{review.employee?.employeeCode}</span></p>
                  <p className="mt-1 text-xs text-slate-500">{review.employee?.department?.name || "Department"} · {review.employee?.designation?.name || "Designation"} · {review.period}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{statusLabel[review.status]}</span>{review.managerReview?.rating ? <span className="text-xs font-semibold text-amber-700">Rating: {review.managerReview.rating}/5</span> : null}</div>
                </div>
                {(canSelfReview || canManagerReview) && <button type="button" onClick={() => openReview(review)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{canSelfReview ? "Self review" : "Review employee"}</button>}
                {review.status === "finalized" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={15} />Complete</span>}
              </div>;
            })}
          </div>}
        </section>

        {selected && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Performance review">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">{selected.employee.firstName} {selected.employee.lastName}</h2><p className="mt-1 text-sm text-slate-500">{selected.period} · {selected.employee.employeeCode}</p></div><button type="button" onClick={() => setSelectedId("")} className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button></div>
            {selected.employee._id === employeeId ? <form onSubmit={submitSelfReview} className="space-y-4">
              <p className="text-sm font-semibold text-slate-700">Employee self-assessment</p>
              <label className={labelClass}>Goals and progress<textarea required maxLength={3000} rows={3} value={goals} onChange={(event) => setGoals(event.target.value)} className={inputClass} placeholder="List your goals and progress..." /></label>
              <label className={labelClass}>Key achievements<textarea required maxLength={3000} rows={3} value={achievements} onChange={(event) => setAchievements(event.target.value)} className={inputClass} placeholder="Describe measurable achievements..." /></label>
              <label className={labelClass}>Strengths<textarea maxLength={2000} rows={2} value={strengths} onChange={(event) => setStrengths(event.target.value)} className={inputClass} placeholder="Your key strengths..." /></label>
              <label className={labelClass}>Areas to improve<textarea maxLength={2000} rows={2} value={improvements} onChange={(event) => setImprovements(event.target.value)} className={inputClass} placeholder="Skills or areas to develop..." /></label>
              <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Send size={16} />Submit self-review</button>
            </form> : <form onSubmit={submitManagerReview} className="space-y-4">
              <p className="text-sm font-semibold text-slate-700">Employee self-assessment</p>
              <div className="grid gap-3 sm:grid-cols-2">{[["Goals", selected.selfReview?.goals], ["Achievements", selected.selfReview?.achievements], ["Strengths", selected.selfReview?.strengths], ["Improvements", selected.selfReview?.improvements]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value || "—"}</p></div>)}</div>
              <label className={labelClass}>Performance rating<select value={rating} onChange={(event) => setRating(event.target.value)} className={inputClass}><option value="1">1 · Needs improvement</option><option value="2">2 · Developing</option><option value="3">3 · Meets expectations</option><option value="4">4 · Exceeds expectations</option><option value="5">5 · Outstanding</option></select></label>
              <label className={labelClass}>Manager comments<textarea required maxLength={3000} rows={4} value={comments} onChange={(event) => setComments(event.target.value)} className={inputClass} placeholder="Provide specific feedback and next steps..." /></label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={finalize} onChange={(event) => setFinalize(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />Finalize this review</label>
              <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><CheckCircle2 size={16} />Save manager review</button>
            </form>}
          </div>
        </div>}
      </div>
    </main>
  );
}

export default function PerformancePage() {
  return <AuthGuard><PerformanceContent /></AuthGuard>;
}
