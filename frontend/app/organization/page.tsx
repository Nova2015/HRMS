"use client";


import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Building2, Plus, RefreshCw, Pencil, Power } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

function ScrollableList({ children, label, count }: { children: ReactNode; label: string; count: number }) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showArrows, setShowArrows] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateOverflow = useCallback(() => {
    const element = listRef.current;
    setHasOverflow(Boolean(element && element.scrollHeight > element.clientHeight + 2));
  }, []);

  const revealArrows = () => {
    if (!hasOverflow) return;
    setShowArrows(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowArrows(false), 5000);
  };

  useEffect(() => {
    updateOverflow();
    const element = listRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    const mutationObserver = new MutationObserver(updateOverflow);
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [children, updateOverflow]);

  const scrollList = (direction: "up" | "down") => {
    listRef.current?.scrollBy({ top: direction === "up" ? -120 : 120, behavior: "smooth" });
    revealArrows();
  };

  return (
    <div className="mt-auto border-t border-slate-100 pt-3">
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
        <span>{expanded ? `Hide ${label}` : `Show ${label}`} <span className="ml-1 text-xs font-medium text-slate-500">({count})</span></span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && <div className="group relative mt-2">
      <div
        ref={listRef}
        onScroll={revealArrows}
        onMouseEnter={revealArrows}
        onTouchStart={revealArrows}
        style={{ height: 180, maxHeight: 180, overflowY: "auto" }}
        className="overscroll-contain divide-y divide-slate-100 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {hasOverflow && (
        <div className={`pointer-events-none absolute right-2 top-2 z-10 flex flex-col gap-2 transition-opacity duration-300 ${showArrows ? "opacity-100" : "opacity-0"}`}>
          <button type="button" aria-label="Scroll up" onClick={() => scrollList("up")} className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur hover:bg-slate-100">
            <ArrowUp size={16} />
          </button>
          <button type="button" aria-label="Scroll down" onClick={() => scrollList("down")} className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur hover:bg-slate-100">
            <ArrowDown size={16} />
          </button>
        </div>
      )}
      </div>}
    </div>
  );
}

type Department = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
};

type Designation = {
  _id: string;
  name: string;
  department: Department | string;
  description?: string;
  isActive: boolean;
};

function OrganizationManagement() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [departmentEditId, setDepartmentEditId] = useState("");
  const [designationEditId, setDesignationEditId] = useState("");
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", description: "" });
  const [designationForm, setDesignationForm] = useState({ name: "", department: "", description: "" });

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [departmentResult, designationResult] = await Promise.all([
        apiRequest("/departments"),
        apiRequest("/designations"),
      ]);
      setDepartments(departmentResult.data || []);
      setDesignations(designationResult.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load organization data");
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => { void Promise.resolve().then(loadData); }, [loadData]);

  const submitDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const path = departmentEditId ? `/departments/${departmentEditId}` : "/departments";
      const result = await apiRequest(path, {
        method: departmentEditId ? "PUT" : "POST",
        body: JSON.stringify({
          name: departmentForm.name.trim(),
          code: departmentForm.code.trim().toUpperCase(),
          description: departmentForm.description.trim(),
        }),
      });
      setMessage(result.message || "Department saved.");
      setDepartmentForm({ name: "", code: "", description: "" });
      setDepartmentEditId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save department");
    } finally { setSaving(false); }
  };

  const submitDesignation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const path = designationEditId ? `/designations/${designationEditId}` : "/designations";
      const result = await apiRequest(path, {
        method: designationEditId ? "PUT" : "POST",
        body: JSON.stringify({
          name: designationForm.name.trim(),
          department: designationForm.department,
          description: designationForm.description.trim(),
        }),
      });
      setMessage(result.message || "Designation saved.");
      setDesignationForm({ name: "", department: "", description: "" });
      setDesignationEditId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save designation");
    } finally { setSaving(false); }
  };

  const toggleDepartment = async (department: Department) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/departments/${department._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !department.isActive }),
      });
      setMessage(result.message || "Department status updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update department");
    } finally { setSaving(false); }
  };

  const toggleDesignation = async (designation: Designation) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/designations/${designation._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !designation.isActive }),
      });
      setMessage(result.message || "Designation status updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update designation");
    } finally { setSaving(false); }
  };

  const departmentName = (department: Department | string) =>
    typeof department === "string" ? "Department" : department?.name || "Department";

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                <ArrowLeft size={15} /> Dashboard
              </Link>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Workspace active</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Organization</h1>
            <h2 className="mt-2 text-base font-semibold text-slate-800">Departments & Designations</h2>
            <p className="mt-1 text-xs text-slate-500">Manage company departments and job titles.</p>
          </div>
          <button type="button" onClick={loadData} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="rounded-lg bg-blue-100 p-2"><Building2 size={18} className="text-blue-600" /></div>
              <div><h2 className="text-base font-bold text-slate-900">Departments</h2><p className="text-sm text-slate-500">{departments.length} total</p></div>
            </div>
            <form onSubmit={submitDepartment} className="mb-4 grid gap-2 sm:grid-cols-2">
              <input required maxLength={100} value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="Department name *" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required maxLength={20} value={departmentForm.code} onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value })} placeholder="Department code * (e.g. HR)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase" />
              <input maxLength={500} value={departmentForm.description} onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })} placeholder="Description (optional)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus size={16} /> {saving ? "Saving..." : departmentEditId ? "Update Department" : "Add Department"}</button>
                {departmentEditId && <button type="button" onClick={() => { setDepartmentEditId(""); setDepartmentForm({ name: "", code: "", description: "" }); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">Cancel</button>}
              </div>
            </form>
            {loading ? <p className="py-6 text-center text-slate-500">Loading departments...</p> : departments.length === 0 ? <p className="py-6 text-center text-slate-500">No departments found.</p> : (
              <ScrollableList label="departments" count={departments.length}>
                {departments.map((department) => (
                  <div key={department._id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{department.name} <span className="text-[11px] font-normal text-slate-500">({department.code})</span></p>
                      {department.description?.trim() && <p className="text-[11px] text-slate-500">{department.description}</p>}
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${department.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{department.isActive ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" title="Edit department" onClick={() => { setDepartmentEditId(department._id); setDepartmentForm({ name: department.name, code: department.code, description: department.description || "" }); }} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"><Pencil size={15} /></button>
                      <button type="button" title={department.isActive ? "Deactivate" : "Activate"} disabled={saving} onClick={() => toggleDepartment(department)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Power size={15} /></button>
                    </div>
                  </div>
                ))}
              </ScrollableList>
            )}
          </section>

          <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="rounded-lg bg-purple-100 p-2"><Building2 size={18} className="text-purple-600" /></div>
              <div><h2 className="text-base font-bold text-slate-900">Designations</h2><p className="text-sm text-slate-500">{designations.length} total</p></div>
            </div>
            <form onSubmit={submitDesignation} className="mb-4 grid gap-2 sm:grid-cols-2">
              <input required maxLength={100} value={designationForm.name} onChange={(e) => setDesignationForm({ ...designationForm, name: e.target.value })} placeholder="Designation name *" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <select required value={designationForm.department} onChange={(e) => setDesignationForm({ ...designationForm, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                <option value="">Select department *</option>
                {departments.filter((d) => d.isActive).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              <input maxLength={500} value={designationForm.description} onChange={(e) => setDesignationForm({ ...designationForm, description: e.target.value })} placeholder="Description (optional)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"><Plus size={16} /> {saving ? "Saving..." : designationEditId ? "Update Designation" : "Add Designation"}</button>
                {designationEditId && <button type="button" onClick={() => { setDesignationEditId(""); setDesignationForm({ name: "", department: "", description: "" }); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">Cancel</button>}
              </div>
            </form>
            {loading ? <p className="py-6 text-center text-slate-500">Loading designations...</p> : designations.length === 0 ? <p className="py-6 text-center text-slate-500">No designations found.</p> : (
              <ScrollableList label="designations" count={designations.length}>
                {designations.map((designation) => (
                  <div key={designation._id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{designation.name}</p>
                      <p className="text-[11px] text-slate-500">{departmentName(designation.department)}{designation.description?.trim() && designation.description.trim().toLowerCase() !== designation.name.trim().toLowerCase() ? ` · ${designation.description}` : ""}</p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${designation.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{designation.isActive ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" title="Edit designation" onClick={() => { const dep = typeof designation.department === "string" ? designation.department : designation.department?._id || ""; setDesignationEditId(designation._id); setDesignationForm({ name: designation.name, department: dep, description: designation.description || "" }); }} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><Pencil size={15} /></button>
                      <button type="button" title={designation.isActive ? "Deactivate" : "Activate"} disabled={saving} onClick={() => toggleDesignation(designation)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Power size={15} /></button>
                    </div>
                  </div>
                ))}
              </ScrollableList>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function OrganizationPage() {
  return <AuthGuard><OrganizationManagement /></AuthGuard>;
}
