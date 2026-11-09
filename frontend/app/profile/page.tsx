"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, UserCircle, BriefcaseBusiness, Clock3, ShieldCheck } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type Profile = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joiningDate?: string;
  employmentStatus: string;
  department?: { name: string; code?: string } | null;
  designation?: { name: string } | null;
  shift?: { name: string; startTime?: string; endTime?: string; weeklyOffDays?: string[] } | null;
  reportingManager?: { employeeCode: string; firstName: string; lastName: string } | null;
};

type CurrentUser = { email: string; role: string; employee: Profile };

function ProfileContent() {
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      window.location.assign("/login");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !result.success || !result.data?.employee) {
        throw new Error(result.message || "Unable to load your profile");
      }
      setProfile(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const date = (value?: string) => value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "-";

  const field = (label: string, value?: string | null) => (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 text-center text-slate-600">Loading your profile...</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Employee self-service</p><h1 className="mt-1 text-3xl font-bold text-slate-900">My Profile</h1><p className="mt-2 text-sm text-slate-500">Your personal and employment information.</p></div>
          <button type="button" onClick={loadProfile} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </header>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!profile ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">{error || "Profile information is unavailable."}</div>
        ) : (
          <>
            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-2xl bg-blue-50 p-4 text-blue-700"><UserCircle size={34} /></div>
                <div className="min-w-0 flex-1"><h2 className="text-2xl font-bold text-slate-900">{profile.employee.firstName} {profile.employee.lastName}</h2><p className="mt-1 text-sm text-slate-500">{profile.employee.employeeCode}</p><p className="mt-1 text-sm text-slate-600">{profile.email}</p></div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${profile.employee.employmentStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{profile.employee.employmentStatus}</span>
              </div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><UserCircle size={19} className="text-blue-600" /> Personal Information</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field("First name", profile.employee.firstName)}{field("Last name", profile.employee.lastName)}{field("Employee code", profile.employee.employeeCode)}{field("Email", profile.employee.email)}{field("Login email", profile.email)}{field("Phone", profile.employee.phone)}</div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><BriefcaseBusiness size={19} className="text-blue-600" /> Employment Information</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field("Department", profile.employee.department?.name)}{field("Designation", profile.employee.designation?.name)}{field("Joining date", date(profile.employee.joiningDate))}{field("Reporting manager", profile.employee.reportingManager ? `${profile.employee.reportingManager.firstName} ${profile.employee.reportingManager.lastName} (${profile.employee.reportingManager.employeeCode})` : "-")}{field("Employment status", profile.employee.employmentStatus)}</div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><Clock3 size={19} className="text-blue-600" /> Shift Information</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field("Assigned shift", profile.employee.shift?.name)}{field("Shift start", profile.employee.shift?.startTime)}{field("Shift end", profile.employee.shift?.endTime)}{field("Weekly off days", profile.employee.shift?.weeklyOffDays?.join(", "))}</div>
            </section>

            <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> This page loads the profile linked to your authenticated account. It does not accept another employee ID. HR/Admin employee management remains restricted to authorized roles.</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return <AuthGuard><ProfileContent /></AuthGuard>;
}
