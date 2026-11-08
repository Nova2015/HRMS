"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type Holiday = {
  _id: string;
  name: string;
  dateKey: string;
  type: "public" | "optional" | "company";
  description?: string;
  isActive: boolean;
};

function HolidayCalendar() {
  const router = useRouter();
  const [items, setItems] = useState<Holiday[]>([]);
  const [role, setRole] = useState("employee");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState({
    name: "",
    dateKey: "",
    type: "public",
    description: "",
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
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Request failed");
    }
    return result;
  }, [router]);

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const includeInactive = canManage ? "&includeInactive=true" : "";
      const result = await apiRequest(`/holidays?year=${encodeURIComponent(year)}${includeInactive}`);
      setItems(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load holidays");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, canManage, year]);

  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
    } catch {
      setRole("employee");
    }
  }, []);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const submitHoliday = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(editId ? `/holidays/${editId}` : "/holidays", {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          dateKey: form.dateKey,
          type: form.type,
          description: form.description.trim(),
        }),
      });
      setMessage(result.message || "Holiday saved.");
      setEditId("");
      setForm({ name: "", dateKey: "", type: "public", description: "" });
      await loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save holiday");
    } finally { setSaving(false); }
  };

  const toggleHoliday = async (holiday: Holiday) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/holidays/${holiday._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !holiday.isActive }),
      });
      setMessage(result.message || "Holiday status updated.");
      await loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update holiday");
    } finally { setSaving(false); }
  };

  const removeHoliday = async (holiday: Holiday) => {
    if (!window.confirm(`Delete holiday "${holiday.name}"?`)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/holidays/${holiday._id}`, { method: "DELETE" });
      setMessage(result.message || "Holiday deleted.");
      await loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete holiday");
    } finally { setSaving(false); }
  };

  const typeLabel = (type: Holiday["type"]) =>
    type === "public" ? "Public Holiday" : type === "optional" ? "Optional Holiday" : "Company Holiday";

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
            <h1 className="text-3xl font-bold text-slate-900">Holiday Calendar</h1>
            <p className="mt-2 text-slate-500">{canManage ? "Create and manage company holidays." : "View the company's active holidays."}</p>
          </div>
          <div className="flex gap-2">
            <select aria-label="Holiday year" value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {[...Array(7)].map((_, i) => {
                const y = new Date().getFullYear() - 2 + i;
                return <option key={y} value={String(y)}>{y}</option>;
              })}
            </select>
            <button type="button" onClick={loadHolidays} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        {canManage && (
          <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-900">{editId ? "Edit Holiday" : "Add Holiday"}</h2>
            <form onSubmit={submitHoliday} className="grid gap-4 md:grid-cols-2">
              <input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Holiday name *" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <input required type="date" value={form.dateKey} onChange={(e) => setForm({ ...form, dateKey: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                <option value="public">Public Holiday</option>
                <option value="optional">Optional Holiday</option>
                <option value="company">Company Holiday</option>
              </select>
              <input maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <div className="flex gap-2 md:col-span-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus size={16} /> {saving ? "Saving..." : editId ? "Update Holiday" : "Add Holiday"}</button>
                {editId && <button type="button" onClick={() => { setEditId(""); setForm({ name: "", dateKey: "", type: "public", description: "" }); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">Cancel</button>}
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-3"><CalendarDays size={22} className="text-blue-600" /></div>
            <div><h2 className="text-xl font-bold text-slate-900">{year} Holidays</h2><p className="text-sm text-slate-500">{items.filter((item) => item.isActive).length} active holidays</p></div>
          </div>
          {loading ? <p className="py-10 text-center text-slate-500">Loading holidays...</p> : items.length === 0 ? <p className="py-10 text-center text-slate-500">No holidays added for this year.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Holiday</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th>{canManage && <th className="px-4 py-3">Status / Actions</th>}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((holiday) => (
                    <tr key={holiday._id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-700">{new Date(`${holiday.dateKey}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-4 font-semibold text-slate-900">{holiday.name}</td>
                      <td className="px-4 py-4">{typeLabel(holiday.type)}</td>
                      <td className="px-4 py-4 text-slate-500">{holiday.description || "—"}</td>
                      {canManage && <td className="px-4 py-4"><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs ${holiday.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{holiday.isActive ? "Active" : "Inactive"}</span><button type="button" title="Edit" onClick={() => { setEditId(holiday._id); setForm({ name: holiday.name, dateKey: holiday.dateKey, type: holiday.type, description: holiday.description || "" }); }} className="rounded-lg border border-slate-300 p-2 text-slate-600"><Pencil size={14} /></button><button type="button" title="Activate/deactivate" disabled={saving} onClick={() => toggleHoliday(holiday)} className="rounded-lg border border-slate-300 p-2 text-slate-600 disabled:opacity-50"><Power size={14} /></button><button type="button" title="Delete" disabled={saving} onClick={() => removeHoliday(holiday)} className="rounded-lg border border-slate-300 p-2 text-red-600 disabled:opacity-50"><Trash2 size={14} /></button></div></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function HolidaysPage() {
  return <AuthGuard><HolidayCalendar /></AuthGuard>;
}
