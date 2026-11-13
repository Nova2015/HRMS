"use client";


import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock3, CalendarDays, Wallet, ArrowUpRight, ShieldCheck, Activity, BarChart3, CheckCircle2, ChevronRight,
} from "lucide-react";
import AuthGuard from "./components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type DashboardEmployee = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  joiningDate?: string;
  employmentStatus: string;
  department?: { name: string } | null;
  designation?: { name: string } | null;
  shift?: { name: string; startTime?: string; endTime?: string } | null;
  reportingManager?: { firstName: string; lastName: string; employeeCode?: string } | null;
};

type DashboardAttendance = {
  _id: string;
  dateKey: string;
  checkIn: string | null;
  checkOut: string | null;
  status: "present" | "half-day" | "absent";
  isLate: boolean;
  employee?: { firstName: string; lastName: string; employeeCode: string };
  createdAt?: string;
  updatedAt?: string;
};

export default function Home() {
  const [role, setRole] = useState("employee");
  const [attendanceRecords, setAttendanceRecords] = useState<DashboardAttendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [employeeProfile, setEmployeeProfile] = useState<DashboardEmployee | null>(null);
  const [employeeProfileLoading, setEmployeeProfileLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string; employeeCode?: string; role?: string } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("hrms_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        const nextRole = user.role || "employee";
        void Promise.resolve().then(() => {
          setRole(nextRole);
          setUserInfo(user);
        });
      } catch {
        void Promise.resolve().then(() => setRole("employee"));
      }
    }
  }, []);

  useEffect(() => {
    if (role !== "employee") return;
    let cancelled = false;
    const loadEmployeeProfile = async () => {
      setEmployeeProfileLoading(true);
      try {
        const token = sessionStorage.getItem("hrms_token");
        if (!token) return;
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        const result = await response.json();
        if (response.status === 401) {
          sessionStorage.removeItem("hrms_token");
          sessionStorage.removeItem("hrms_user");
          window.location.href = "/login";
          return;
        }
        if (!response.ok || !result.success || !result.data?.employee) throw new Error(result.message || "Unable to load employee information");
        if (!cancelled) setEmployeeProfile(result.data.employee);
      } catch (error) {
        console.error("Employee dashboard profile load failed:", error);
        if (!cancelled) setEmployeeProfile(null);
      } finally {
        if (!cancelled) setEmployeeProfileLoading(false);
      }
    };
    void loadEmployeeProfile();
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (role !== "admin" && role !== "hr") return;
    const loadDashboardAttendance = async () => {
      setAttendanceLoading(true);
      setAttendanceError("");
      try {
        const token = sessionStorage.getItem("hrms_token");
        if (!token) return;
        const now = new Date();
        const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
        const response = await fetch(`${API_URL}/attendance?from=${from}&to=${to}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (response.status === 401) {
          sessionStorage.removeItem("hrms_token");
          sessionStorage.removeItem("hrms_user");
          window.location.href = "/login";
          return;
        }
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to load attendance dashboard");
        setAttendanceRecords(Array.isArray(result.data) ? result.data : []);
      } catch (error) {
        setAttendanceError(error instanceof Error ? error.message : "Unable to load attendance dashboard");
      } finally {
        setAttendanceLoading(false);
      }
    };
    void loadDashboardAttendance();
  }, [role]);

  const isAdmin = role === "admin" || role === "hr";
  return (
    <AuthGuard>
      <main className="hrms-home min-h-screen px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <section className={`relative mb-6 overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white shadow-xl shadow-indigo-950/10 sm:px-8 sm:py-7 ${role === "employee" ? "hrms-employee-hero" : ""}`}>
            <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[40px] border-white/5" />
            <div className="pointer-events-none absolute right-24 top-16 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
            {role === "employee" ? (
              <div className="hrms-employee-hero-content relative z-10 max-w-2xl">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1 w-7 rounded-full bg-gradient-to-r from-sky-300 to-blue-500 shadow-[0_0_14px_rgba(96,165,250,0.55)]" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">Employee profile</p>
                </div>
                <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                  {employeeProfileLoading ? "Loading your profile…" : employeeProfile ? `${employeeProfile.firstName} ${employeeProfile.lastName}` : "Your employee information"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-blue-100">{employeeProfile?.designation?.name || "Designation not assigned"}{employeeProfile?.department?.name ? ` · ${employeeProfile.department.name}` : ""}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize tracking-wide ${employeeProfile?.employmentStatus === "active" ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : "border-white/15 bg-white/10 text-slate-200"}`}>{employeeProfileLoading ? "Loading" : employeeProfile?.employmentStatus || "Profile unavailable"}</span>
                </div>
                {employeeProfile ? (
                  <div className="mt-5 max-w-xl border-l-2 border-blue-300/40 pl-4">
                    <div className="grid max-w-xl gap-y-2">
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Employee ID</span><span className="ml-2 font-semibold text-white">{employeeProfile.employeeCode}</span></p>
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Department</span><span className="ml-2 font-semibold text-white">{employeeProfile.department?.name || "Not assigned"}</span></p>
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Joining date</span><span className="ml-2 font-semibold text-white">{employeeProfile.joiningDate ? new Date(employeeProfile.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span></p>
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reporting manager</span><span className="ml-2 font-semibold text-white">{employeeProfile.reportingManager ? `${employeeProfile.reportingManager.firstName} ${employeeProfile.reportingManager.lastName}` : "Not assigned"}</span></p>
                    </div>
                  </div>
                ) : !employeeProfileLoading ? (
                  <p className="mt-4 text-sm text-slate-300">Employee details could not be loaded. Open your profile to review your information.</p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Link href="/profile" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-50">View full profile <ArrowUpRight size={15} /></Link>
                  {employeeProfile?.shift?.name && <span className="text-[11px] text-slate-300">Shift: <strong className="text-white">{employeeProfile.shift.name}{employeeProfile.shift.startTime && employeeProfile.shift.endTime ? ` · ${employeeProfile.shift.startTime}–${employeeProfile.shift.endTime}` : ""}</strong></span>}
                </div>
              </div>
            ) : (
              <>
                <div className="relative z-10 max-w-2xl">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">PROTOVERGE LLP</span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">{isAdmin ? (role === "admin" ? "Administrator" : "HR Manager") : "Employee"}</span>
                  </div>
                  <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                    Welcome, {userInfo?.name || (role === "admin" ? "Administrator" : "HR Manager")}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-blue-100">{isAdmin ? "Company people operations workspace" : "Your team, in one place."}</p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
                    {userInfo?.employeeCode && <span><span className="text-slate-400">Employee ID</span><strong className="ml-2 text-white">{userInfo.employeeCode}</strong></span>}
                    {userInfo?.email && <span><span className="text-slate-400">Work email</span><strong className="ml-2 text-white">{userInfo.email}</strong></span>}
                    <span><span className="text-slate-400">Workspace</span><strong className="ml-2 text-white">PROTOVERGE LLP</strong></span>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={isAdmin ? "/employees" : "/leaves"} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-blue-50">{isAdmin ? "View employees" : "Review team leaves"} <ArrowUpRight size={16} /></Link>
                    <Link href="/attendance" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15">{isAdmin ? "Open attendance register" : "My attendance"} <ChevronRight size={16} /></Link>
                  </div>
                </div>
                <div className="relative z-10 mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/15 pt-5 sm:absolute sm:bottom-8 sm:right-9 sm:mt-0 sm:w-[390px] sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
                  <div><p className="text-xs text-slate-400">Reporting period</p><p className="mt-1 text-sm font-semibold">{new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p></div>
                  <div><p className="text-xs text-slate-400">Workspace</p><p className="mt-1 text-sm font-semibold">Centralized</p></div>
                  <div><p className="text-xs text-slate-400">Access</p><p className="mt-1 text-sm font-semibold">Role-based</p></div>
                </div>
              </>
            )}
          </section>

          {isAdmin && (
            <section className="mb-6">
              <div className="mb-3">
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Workspace overview</h2>
                <p className="mt-1 text-sm text-slate-500">A quick snapshot of your company attendance activity.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance entries</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{attendanceLoading ? "…" : attendanceRecords.length}</p><p className="mt-1 text-xs text-slate-500">Recorded this month</p></div>
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employees recorded</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{attendanceLoading ? "…" : new Set(attendanceRecords.map((item) => item.employee?.employeeCode).filter(Boolean)).size}</p><p className="mt-1 text-xs text-slate-500">Unique employees this month</p></div>
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Present today</p><p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">{attendanceLoading ? "…" : attendanceRecords.filter((item) => item.dateKey === new Date().toLocaleDateString("en-CA") && item.status === "present").length}</p><p className="mt-1 text-xs text-slate-500">Today's recorded presence</p></div>
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late arrivals</p><p className="mt-2 text-2xl font-bold tabular-nums text-orange-700">{attendanceLoading ? "…" : attendanceRecords.filter((item) => item.isLate).length}</p><p className="mt-1 text-xs text-slate-500">Recorded this month</p></div>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="mb-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  
                  <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Attendance dashboard</h2>
                  <p className="mt-1 text-sm text-slate-500">Company attendance recorded from the start of this month to today.</p>
                </div>
                <Link href="/attendance" className="text-sm font-semibold text-blue-700 hover:text-blue-900">Open attendance register →</Link>
              </div>
              {attendanceError && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{attendanceError}</p>}
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Present records", value: attendanceRecords.filter((item) => item.status === "present").length, icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50" },
                  { label: "Half-day records", value: attendanceRecords.filter((item) => item.status === "half-day").length, icon: Clock3, color: "text-amber-700 bg-amber-50" },
                  { label: "Absent records", value: attendanceRecords.filter((item) => item.status === "absent").length, icon: Activity, color: "text-rose-700 bg-rose-50" },
                  { label: "Late arrivals", value: attendanceRecords.filter((item) => item.isLate).length, icon: Clock3, color: "text-orange-700 bg-orange-50" },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return <div key={stat.label} className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-4">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{stat.label}</span><span className={`rounded-lg p-2 ${stat.color}`}><Icon size={18} /></span></div>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{attendanceLoading ? "…" : stat.value}</p>
                  </div>;
                })}
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-5">
                  <div className="mb-5 flex items-center gap-2"><BarChart3 size={19} className="text-blue-700" /><h3 className="font-bold text-slate-900">Attendance trend · Last 7 days</h3></div>
                  <div className="flex h-44 items-end justify-around gap-3 border-b border-slate-100 pb-2">
                    {Array.from({ length: 7 }, (_, index) => {
                      const day = new Date();
                      day.setDate(day.getDate() - (6 - index));
                      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      const count = attendanceRecords.filter((record) => record.dateKey === key && record.status !== "absent").length;
                      const max = Math.max(1, ...Array.from({ length: 7 }, (_, offset) => {
                        const d = new Date(); d.setDate(d.getDate() - (6 - offset));
                        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        return attendanceRecords.filter((record) => record.dateKey === k && record.status !== "absent").length;
                      }));
                      return <div key={key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                        <span className="text-xs font-semibold text-slate-600">{count}</span>
                        <div className="w-full max-w-10 rounded-t-lg bg-blue-600 transition-all" style={{ height: `${Math.max(5, (count / max) * 112)}px` }} />
                        <span className="text-[11px] text-slate-500">{day.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                      </div>;
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">Counts include present and half-day records for each date.</p>
                </div>
                <div className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-5">
                  <div className="mb-4 flex items-center gap-2"><Activity size={19} className="text-blue-700" /><h3 className="font-bold text-slate-900">Recent Activity</h3></div>
                  {attendanceLoading ? <p className="py-6 text-sm text-slate-500">Loading recent activity…</p> : attendanceRecords.length === 0 ? <p className="py-6 text-sm text-slate-500">No attendance records found for this month yet.</p> : (
                    <div className="space-y-3">
                      {[...attendanceRecords].sort((a, b) => new Date(b.updatedAt || b.createdAt || b.dateKey).getTime() - new Date(a.updatedAt || a.createdAt || a.dateKey).getTime()).slice(0, 6).map((record) => (
                        <div key={record._id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{record.employee ? `${record.employee.firstName} ${record.employee.lastName}` : "Employee"}</p><p className="text-xs text-slate-500">{record.employee?.employeeCode || "—"} · {record.dateKey}</p></div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${record.status === "present" ? "bg-emerald-50 text-emerald-700" : record.status === "half-day" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{record.status.replace("-", " ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/80 py-4 text-[10px] font-medium text-slate-400">
            <span>HRMS</span>
            
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}
