"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, Users, UserCheck, UserPlus, Search, RefreshCw, Plus, X, CheckCircle2 } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type Department = { _id: string; name: string; code?: string; description?: string; isActive?: boolean };
type Designation = { _id: string; name: string; department?: string | { _id?: string; name?: string }; description?: string; isActive?: boolean };
const getDesignationDepartmentId = (department: Designation["department"]) => typeof department === "string" ? department : department?._id || "";
type Job = {
  _id: string; title: string; description: string; employmentType: string;
  location: string; openings: number; status: "open" | "on_hold" | "closed";
  department: Department; designation: Designation;
};
type Candidate = {
  _id: string; firstName: string; lastName: string; email: string; phone: string;
  experienceYears: number; currentCompany: string; resumeUrl: string; notes: string;
  status: "applied" | "screening" | "interview" | "selected" | "rejected" | "hired";
  jobOpening: { _id: string; title: string; status: string };
  department: Department; designation: Designation;
  employee?: { employeeCode: string } | null;
};
type Workspace = {
  jobs: Job[]; candidates: Candidate[]; departments: Department[];
  designations: Designation[];
  summary: { openJobs: number; totalCandidates: number; inPipeline: number; selected: number; hired: number };
};

const statusStyles: Record<string, string> = {
  applied: "bg-sky-50 text-sky-700", screening: "bg-violet-50 text-violet-700",
  interview: "bg-amber-50 text-amber-700", selected: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700", hired: "bg-indigo-50 text-indigo-700"
};

function RecruitmentWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [hireCandidate, setHireCandidate] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [jobForm, setJobForm] = useState({ title: "", department: "", designation: "", description: "", employmentType: "full_time", location: "", openings: "1" });
  const [candidateForm, setCandidateForm] = useState({ firstName: "", lastName: "", email: "", phone: "", jobOpening: "", experienceYears: "0", currentCompany: "", resumeUrl: "", notes: "" });
  const [hireForm, setHireForm] = useState({ employeeCode: "", joiningDate: "", initialPassword: "" });
  const [canManageMasters, setCanManageMasters] = useState(false);
  const [departmentForm, setDepartmentForm] = useState({ id: "", name: "", code: "", description: "" });

  const token = () => sessionStorage.getItem("hrms_token") || "";
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}/recruitment${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
      cache: "no-store"
    });
    const result = await response.json();
    if (response.status === 401) {
      sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user");
      window.location.href = "/login";
      throw new Error("Session expired. Please sign in again.");
    }
    if (!response.ok || !result.success) throw new Error(result.message || "Recruitment request failed");
    return result;
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await request("/");
      setData(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Recruitment");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try { const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}"); setCanManageMasters(["admin", "hr"].includes(String(user.role || "").toLowerCase())); }
    catch { setCanManageMasters(false); }
  }, []);

  const masterRequest = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) }, cache: "no-store" });
    const result = await response.json();
    if (response.status === 401) { sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user"); window.location.href = "/login"; throw new Error("Session expired. Please sign in again."); }
    if (!response.ok || !result.success) throw new Error(result.message || "Master data request failed");
    return result;
  };

  const saveDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { const editing = Boolean(departmentForm.id); await masterRequest(editing ? `/departments/${departmentForm.id}` : "/departments", { method: editing ? "PUT" : "POST", body: JSON.stringify({ name: departmentForm.name, code: departmentForm.code, description: departmentForm.description }) }); setNotice(editing ? "Department updated." : "Department added."); setDepartmentForm({ id: "", name: "", code: "", description: "" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save department"); } finally { setSaving(false); }
  };

  const toggleMasterStatus = async (kind: "departments" | "designations", item: Department | Designation) => {
    setError(""); setNotice("");
    try { await masterRequest(`/${kind}/${item._id}`, { method: "PUT", body: JSON.stringify({ isActive: item.isActive === false }) }); setNotice(`${kind === "departments" ? "Department" : "Designation"} ${item.isActive === false ? "activated" : "deactivated"}.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update status"); }
  };

  const filteredCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!data) return [];
    return data.candidates.filter((candidate) =>
      `${candidate.firstName} ${candidate.lastName} ${candidate.email} ${candidate.jobOpening?.title || ""}`.toLowerCase().includes(term)
    );
  }, [data, search]);

  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await request("/jobs", { method: "POST", body: JSON.stringify({ ...jobForm, openings: Number(jobForm.openings) }) });
      setNotice("Job opening created successfully."); setShowJobForm(false);
      setJobForm({ title: "", department: "", designation: "", description: "", employmentType: "full_time", location: "", openings: "1" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create job opening"); }
    finally { setSaving(false); }
  };

  const submitCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await request("/candidates", { method: "POST", body: JSON.stringify({ ...candidateForm, experienceYears: Number(candidateForm.experienceYears) }) });
      setNotice("Candidate added successfully."); setShowCandidateForm(false);
      setCandidateForm({ firstName: "", lastName: "", email: "", phone: "", jobOpening: "", experienceYears: "0", currentCompany: "", resumeUrl: "", notes: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add candidate"); }
    finally { setSaving(false); }
  };

  const changeStatus = async (candidate: Candidate, status: string) => {
    setError(""); setNotice("");
    try {
      await request(`/candidates/${candidate._id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice("Candidate status updated."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update status"); }
  };

  const submitHire = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!hireCandidate) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await request(`/candidates/${hireCandidate._id}/hire`, { method: "POST", body: JSON.stringify(hireForm) });
      setNotice(`${result.data.employee.firstName} ${result.data.employee.lastName} was added to Employees as ${result.data.employee.employeeCode}.`);
      setHireCandidate(null); setHireForm({ employeeCode: "", joiningDate: "", initialPassword: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to hire candidate"); }
    finally { setSaving(false); }
  };

  const changeJobStatus = async (job: Job, status: string) => {
    setError(""); setNotice("");
    try {
      await request(`/jobs/${job._id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice("Job opening updated."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update job"); }
  };

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">People operations</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Recruitment & Applicant Tracking</h1>
            <p className="mt-2 text-sm text-slate-500">Manage job openings, candidate pipeline and employee onboarding.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setShowJobForm(true); setShowCandidateForm(false); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-200"><Plus size={16} /> New Job</button>
            <button onClick={() => { setShowCandidateForm(true); setShowJobForm(false); }} disabled={!data?.jobs.some((job) => job.status === "open")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><UserPlus size={16} /> Add Candidate</button>
            <button onClick={load} disabled={loading} title="Refresh" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={17} /></button>
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Open positions", value: data?.summary.openJobs ?? 0, icon: BriefcaseBusiness, tint: "bg-blue-50 text-blue-700" },
            { label: "Total candidates", value: data?.summary.totalCandidates ?? 0, icon: Users, tint: "bg-violet-50 text-violet-700" },
            { label: "In pipeline", value: data?.summary.inPipeline ?? 0, icon: Search, tint: "bg-amber-50 text-amber-700" },
            { label: "Selected", value: data?.summary.selected ?? 0, icon: UserCheck, tint: "bg-emerald-50 text-emerald-700" },
            { label: "Hired", value: data?.summary.hired ?? 0, icon: CheckCircle2, tint: "bg-indigo-50 text-indigo-700" }
          ].map((stat) => { const Icon = stat.icon; return <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{stat.label}</span><span className={`rounded-xl p-2 ${stat.tint}`}><Icon size={18} /></span></div><p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{loading ? "…" : stat.value}</p></div>; })}
        </section>


        {showJobForm && (
          <form onSubmit={submitJob} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-900">Create job opening</h2><button type="button" onClick={() => setShowJobForm(false)}><X size={18} /></button></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label><span className={labelClass}>Job title *</span><input required maxLength={120} className={inputClass} value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} /></label>
              <label><span className={labelClass}>Department *</span><select required className={inputClass} value={jobForm.department} onChange={(e) => setJobForm({ ...jobForm, department: e.target.value, designation: "" })}><option value="">Select department</option>{data?.departments.filter((d) => d.isActive !== false).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
              <label><span className={labelClass}>Designation *</span><select required disabled={!jobForm.department} className={inputClass} value={jobForm.designation} onChange={(e) => setJobForm({ ...jobForm, designation: e.target.value })}><option value="">{!jobForm.department ? "Select department first" : data?.designations.some((d) => d.isActive !== false && getDesignationDepartmentId(d.department) === jobForm.department) ? "Select designation" : "No designations for this department"}</option>{data?.designations.filter((d) => d.isActive !== false && getDesignationDepartmentId(d.department) === jobForm.department).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
              <label><span className={labelClass}>Employment type</span><select className={inputClass} value={jobForm.employmentType} onChange={(e) => setJobForm({ ...jobForm, employmentType: e.target.value })}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></label>
              <label><span className={labelClass}>Location</span><input className={inputClass} value={jobForm.location} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} /></label>
              <label><span className={labelClass}>Number of openings *</span><input required type="number" min="1" step="1" className={inputClass} value={jobForm.openings} onChange={(e) => setJobForm({ ...jobForm, openings: e.target.value })} /></label>
              <label className="md:col-span-2 xl:col-span-3"><span className={labelClass}>Job description *</span><textarea required rows={3} maxLength={5000} className={inputClass} value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex justify-end"><button disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Create Job Opening"}</button></div>
          </form>
        )}

        {showCandidateForm && (
          <form onSubmit={submitCandidate} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-900">Add candidate</h2><button type="button" onClick={() => setShowCandidateForm(false)}><X size={18} /></button></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label><span className={labelClass}>First name *</span><input required className={inputClass} value={candidateForm.firstName} onChange={(e) => setCandidateForm({ ...candidateForm, firstName: e.target.value })} /></label>
              <label><span className={labelClass}>Last name *</span><input required className={inputClass} value={candidateForm.lastName} onChange={(e) => setCandidateForm({ ...candidateForm, lastName: e.target.value })} /></label>
              <label><span className={labelClass}>Email *</span><input required type="email" className={inputClass} value={candidateForm.email} onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })} /></label>
              <label><span className={labelClass}>Phone *</span><input required className={inputClass} value={candidateForm.phone} onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })} /></label>
              <label><span className={labelClass}>Job opening *</span><select required className={inputClass} value={candidateForm.jobOpening} onChange={(e) => setCandidateForm({ ...candidateForm, jobOpening: e.target.value })}><option value="">Select job</option>{data?.jobs.filter((job) => job.status === "open").map((job) => <option key={job._id} value={job._id}>{job.title} · {job.department.name}</option>)}</select></label>
              <label><span className={labelClass}>Experience (years)</span><input type="number" min="0" max="60" step="0.5" className={inputClass} value={candidateForm.experienceYears} onChange={(e) => setCandidateForm({ ...candidateForm, experienceYears: e.target.value })} /></label>
              <label><span className={labelClass}>Current company</span><input className={inputClass} value={candidateForm.currentCompany} onChange={(e) => setCandidateForm({ ...candidateForm, currentCompany: e.target.value })} /></label>
              <label><span className={labelClass}>Resume URL</span><input type="url" placeholder="https://" className={inputClass} value={candidateForm.resumeUrl} onChange={(e) => setCandidateForm({ ...candidateForm, resumeUrl: e.target.value })} /></label>
              <label className="md:col-span-2 xl:col-span-3"><span className={labelClass}>Recruiter notes</span><textarea rows={2} maxLength={2000} className={inputClass} value={candidateForm.notes} onChange={(e) => setCandidateForm({ ...candidateForm, notes: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex justify-end"><button disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Save Candidate"}</button></div>
          </form>
        )}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Job openings</h2><p className="mt-1 text-sm text-slate-500">Manage positions available for applications.</p></div><span className="text-xs text-slate-400">{data?.jobs.length ?? 0} positions</span></div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading jobs…</p> : !data?.jobs.length ? <p className="py-8 text-center text-sm text-slate-500">No job openings yet. Create the first position.</p> : <div className="grid gap-3 lg:grid-cols-2">{data.jobs.map((job) => <article key={job._id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{job.title}</h3><p className="mt-1 text-xs text-slate-500">{job.department?.name} · {job.designation?.name} · {job.location || "Location not specified"}</p></div><select aria-label={`Status for ${job.title}`} value={job.status} onChange={(e) => changeJobStatus(job, e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700"><option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select></div><p className="mt-3 line-clamp-2 text-sm text-slate-600">{job.description}</p><p className="mt-3 text-xs font-medium text-slate-500">{job.openings} opening(s) · {job.employmentType.replace("_", " ")}</p></article>)}</div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Candidate pipeline</h2><p className="mt-1 text-sm text-slate-500">Move applicants through review and selection.</p></div><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate or job…" className="w-64 max-w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div></div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading candidates…</p> : !filteredCandidates.length ? <p className="py-8 text-center text-sm text-slate-500">No candidates found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Position</th><th className="px-3 py-3">Experience</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Pipeline action</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredCandidates.map((candidate) => <tr key={candidate._id} className="hover:bg-slate-50/70"><td className="px-3 py-4"><p className="font-semibold text-slate-900">{candidate.firstName} {candidate.lastName}</p><p className="mt-1 text-xs text-slate-500">{candidate.email} · {candidate.phone}</p>{candidate.resumeUrl && <a href={candidate.resumeUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-700">View resume</a>}</td><td className="px-3 py-4"><p className="font-medium text-slate-700">{candidate.jobOpening?.title || "—"}</p><p className="text-xs text-slate-500">{candidate.department?.name} · {candidate.designation?.name}</p></td><td className="px-3 py-4 text-slate-600">{candidate.experienceYears} yrs</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[candidate.status] || "bg-slate-100 text-slate-700"}`}>{candidate.status}</span>{candidate.employee && <p className="mt-1 text-xs text-slate-500">{candidate.employee.employeeCode}</p>}</td><td className="px-3 py-4">{candidate.status === "hired" ? <span className="text-xs font-semibold text-emerald-700">Added to Employees</span> : candidate.status === "selected" ? <button onClick={() => { setHireCandidate(candidate); setError(""); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Create Employee</button> : <select aria-label={`Pipeline status for ${candidate.firstName}`} value={candidate.status} onChange={(e) => changeStatus(candidate, e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-700"><option value="applied">Applied</option><option value="screening">Screening</option><option value="interview">Interview</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select>}</td></tr>)}</tbody></table></div>}
        </section>
      </div>

      {hireCandidate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitHire} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Create employee record</h2><button type="button" onClick={() => setHireCandidate(null)}><X size={18} /></button></div><p className="mb-5 text-sm text-slate-500">Candidate details for <strong>{hireCandidate.firstName} {hireCandidate.lastName}</strong> will be transferred automatically. Add only the remaining employee account details.</p><div className="space-y-4"><label className="block"><span className={labelClass}>Employee code *</span><input required className={inputClass} value={hireForm.employeeCode} onChange={(e) => setHireForm({ ...hireForm, employeeCode: e.target.value })} /></label><label className="block"><span className={labelClass}>Joining date *</span><input required type="date" className={inputClass} value={hireForm.joiningDate} onChange={(e) => setHireForm({ ...hireForm, joiningDate: e.target.value })} /></label><label className="block"><span className={labelClass}>Initial login password *</span><input required type="password" minLength={12} maxLength={72} autoComplete="new-password" className={inputClass} value={hireForm.initialPassword} onChange={(e) => setHireForm({ ...hireForm, initialPassword: e.target.value })} /><span className="mt-1 block text-xs text-slate-400">At least 12 characters. Admin can reset it later.</span></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setHireCandidate(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "Creating…" : "Create Employee"}</button></div></form></div>}
    </main>
  );
}

export default function RecruitmentPage() {
  return <AuthGuard><RecruitmentWorkspace /></AuthGuard>;
}
