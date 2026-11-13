"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock3, Plus, RefreshCw, Pencil, Power, Trash2 } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type Shift = {
  _id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  weeklyOffDays: number[];
  description?: string;
  isActive: boolean;
};

type ShiftForm = {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: string;
  weeklyOffDays: number[];
  description: string;
};

type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  shift?: Shift | null;
};

function ShiftManagement() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editId, setEditId] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ShiftForm>({
    name: "", code: "", startTime: "09:00", endTime: "18:00",
    gracePeriodMinutes: "15", weeklyOffDays: [], description: "",
  });
  const canManage = role === "admin" || role === "hr";

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
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [shiftResult, employeeResult] = await Promise.all([
        apiRequest(`/shifts${canManage ? "?includeInactive=true" : ""}`),
        canManage ? apiRequest("/employees") : Promise.resolve({ data: [] }),
      ]);
      setShifts(shiftResult.data || []);
      setEmployees(employeeResult.data || []);
      const values: Record<string, string> = {};
      for (const employee of (employeeResult.data || []) as Employee[]) {
        values[employee._id] = employee.shift?._id || "";
      }
      setAssignments(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shifts");
    } finally { setLoading(false); }
  }, [apiRequest, canManage]);

  useEffect(() => {
    let nextRole = "employee";
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      nextRole = user.role || "employee";
    } catch { nextRole = "employee"; }
    void Promise.resolve().then(() => setRole(nextRole));
  }, []);

  useEffect(() => { void Promise.resolve().then(loadData); }, [loadData]);

  const submitShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(editId ? `/shifts/${editId}` : "/shifts", {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          gracePeriodMinutes: Number(form.gracePeriodMinutes),
          weeklyOffDays: form.weeklyOffDays,
          description: form.description.trim(),
        }),
      });
      setMessage(result.message || "Shift saved.");
      setEditId("");
      setForm({ name: "", code: "", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: "15", weeklyOffDays: [], description: "" });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save shift");
    } finally { setSaving(false); }
  };

  const toggleShift = async (shift: Shift) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/shifts/${shift._id}`, {
        method: "PUT", body: JSON.stringify({ isActive: !shift.isActive }),
      });
      setMessage(result.message || "Shift status updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update shift");
    } finally { setSaving(false); }
  };

  const deleteShift = async (shift: Shift) => {
    if (!window.confirm(`Delete shift "${shift.name}"?`)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/shifts/${shift._id}`, { method: "DELETE" });
      setMessage(result.message || "Shift deleted.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete shift");
    } finally { setSaving(false); }
  };

  const assignShift = async (employee: Employee) => {
    setSaving(true); setError(""); setMessage("");
    try {
      await apiRequest(`/employees/${employee._id}`, {
        method: "PUT",
        body: JSON.stringify({ shift: assignments[employee._id] || null }),
      });
      setMessage(`Shift assignment updated for ${employee.firstName} ${employee.lastName}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign shift");
    } finally { setSaving(false); }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 p-3 sm:p-5 lg:p-6">
      <div className="mx-auto w-full max-w-7xl min-w-0">
        <header className="mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">Shift Management</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500 sm:mt-2">Configure working hours and assign shifts to employees.</p>
          </div>
          <button type="button" onClick={loadData} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"><RefreshCw size={16} /> Refresh</button>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        {canManage ? (
          <>
            <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6 lg:p-7">
              <h2 className="mb-4 text-xl font-bold text-slate-900">{editId ? "Edit Shift" : "Create Shift"}</h2>
              <form onSubmit={submitShift} className="grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                <input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shift name *" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
                <input required maxLength={20} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Shift code *" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase" />
                <label className="text-sm text-slate-600">Start time<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                <label className="text-sm text-slate-600">End time<input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                <label className="text-sm text-slate-600">Grace period (minutes)<input required type="number" min="0" max="180" value={form.gracePeriodMinutes} onChange={(e) => setForm({ ...form, gracePeriodMinutes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                <div className="rounded-lg border border-slate-200 p-3 md:col-span-2 lg:col-span-3">
                  <p className="mb-2 text-sm font-semibold text-slate-700">Weekly Off Days</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                      <label key={day} className="inline-flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" checked={form.weeklyOffDays.includes(index)} onChange={(e) => setForm({ ...form, weeklyOffDays: e.target.checked ? [...form.weeklyOffDays, index].sort() : form.weeklyOffDays.filter((value) => value !== index) })} />
                        {day}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Select the weekly off pattern applicable to employees assigned to this shift.</p>
                </div>
                <input maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
                <div className="flex flex-col gap-2 sm:flex-row lg:col-span-3">
                  <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto"><Plus size={16} /> {saving ? "Saving..." : editId ? "Update Shift" : "Create Shift"}</button>
                  {editId && <button type="button" onClick={() => { setEditId(""); setForm({ name: "", code: "", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: "15", weeklyOffDays: [], description: "" }); }} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm sm:w-auto">Cancel</button>}
                </div>
              </form>
            </section>

            <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6 lg:p-7">
              <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-slate-900">Shift Definitions</h2><p className="mt-1 text-sm text-slate-500">Manage working hours, grace periods and weekly offs.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{shifts.length} {shifts.length === 1 ? "shift" : "shifts"}</span></div>
              {loading ? <p className="py-6 text-center text-slate-500">Loading shifts...</p> : shifts.length === 0 ? <p className="py-6 text-center text-slate-500">No shifts created.</p> : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {shifts.map((shift) => (
                    <article key={shift._id} className="flex min-h-[245px] flex-col rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md xl:p-5">
                      <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">{shift.name}</h3><p className="text-xs text-slate-500">{shift.code}</p></div><span className={`rounded-full px-2 py-1 text-xs ${shift.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{shift.isActive ? "Active" : "Inactive"}</span></div>
                      <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-slate-800"><Clock3 size={18} /> {shift.startTime} – {shift.endTime}</p>
                      <p className="mt-1 text-sm text-slate-500">Grace period: {shift.gracePeriodMinutes} minutes</p>
                      <p className="mt-1 text-sm text-slate-500">Weekly off: {(shift.weeklyOffDays || []).length ? shift.weeklyOffDays.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ") : "Not configured"}</p>
                      <p className="mt-1 text-sm text-slate-500">{shift.description || "No description"}</p>
                      <div className="mt-auto flex gap-2 border-t border-slate-100 pt-4">
                        <button type="button" onClick={() => { setEditId(shift._id); setForm({ name: shift.name, code: shift.code, startTime: shift.startTime, endTime: shift.endTime, gracePeriodMinutes: String(shift.gracePeriodMinutes), weeklyOffDays: shift.weeklyOffDays || [], description: shift.description || "" }); }} className="rounded-lg border border-slate-300 p-2 text-slate-600" title="Edit"><Pencil size={15} /></button>
                        <button type="button" disabled={saving} onClick={() => toggleShift(shift)} className="rounded-lg border border-slate-300 p-2 text-slate-600 disabled:opacity-50" title="Activate/deactivate"><Power size={15} /></button>
                        <button type="button" disabled={saving} onClick={() => deleteShift(shift)} className="rounded-lg border border-slate-300 p-2 text-red-600 disabled:opacity-50" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6 lg:p-7">
              <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold text-slate-900">Employee Shift Assignment</h2>
              <p className="mt-1 text-sm text-slate-500">Each employee can be assigned one active shift. Save each assignment separately.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{employees.filter((e) => e.employmentStatus === "active").length} active employees</span></div>
              {loading ? <p className="py-6 text-center text-slate-500">Loading employees...</p> : employees.length === 0 ? <p className="py-6 text-center text-slate-500">No employees found.</p> : (
                (<>
                  <div className="space-y-3 md:hidden">
                    {employees.filter((e) => e.employmentStatus === "active").map((employee) => (
                      <article key={employee._id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{employee.firstName} {employee.lastName}</p><p className="mt-0.5 text-xs text-slate-500">{employee.employeeCode}</p></div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{employee.shift?.name || "Not assigned"}</span>
                        </div>
                        <label className="mt-3 block text-xs font-semibold text-slate-600">Assign shift
                          <select value={assignments[employee._id] || ""} onChange={(e) => setAssignments({ ...assignments, [employee._id]: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">No shift</option>{shifts.filter((s) => s.isActive).map((s) => <option key={s._id} value={s._id}>{s.name} ({s.startTime}–{s.endTime})</option>)}</select>
                        </label>
                        <button type="button" disabled={saving} onClick={() => assignShift(employee)} className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Save assignment</button>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                    <table className="w-full min-w-[650px] text-left text-sm">
                      <thead className="sticky top-0 border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Current Shift</th><th className="px-4 py-3 font-semibold">Assign Shift</th><th className="px-4 py-3 font-semibold">Action</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{employees.filter((e) => e.employmentStatus === "active").map((employee) => (
                        <tr key={employee._id} className="transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3"><p className="font-semibold text-slate-900">{employee.firstName} {employee.lastName}</p><p className="text-xs text-slate-500">{employee.employeeCode}</p></td>
                          <td className="px-4 py-3">{employee.shift?.name || "Not assigned"}</td>
                          <td className="px-4 py-3"><select value={assignments[employee._id] || ""} onChange={(e) => setAssignments({ ...assignments, [employee._id]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No shift</option>{shifts.filter((s) => s.isActive).map((s) => <option key={s._id} value={s._id}>{s.name} ({s.startTime}–{s.endTime})</option>)}</select></td>
                          <td className="px-4 py-3"><button type="button" disabled={saving} onClick={() => assignShift(employee)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>)
              )}
            </section>
          </>
        ) : (
          <section className="rounded-xl bg-white p-6 shadow-sm"><h2 className="mb-4 text-xl font-bold text-slate-900">Active Shifts</h2>{shifts.map((shift) => <div key={shift._id} className="border-b py-3"><p className="font-semibold">{shift.name}</p><p className="text-sm text-slate-500">{shift.startTime} – {shift.endTime} · Grace {shift.gracePeriodMinutes} min</p></div>)}</section>
        )}
        <p className="mt-4 text-xs text-slate-500">Shift definitions and assignments are saved. Attendance check-in rules still use the existing attendance policy and will be connected to assigned shifts in a separate verified step.</p>
      </div>
    </main>
  );
}

export default function ShiftsPage() {
  return <AuthGuard><ShiftManagement /></AuthGuard>;
}
