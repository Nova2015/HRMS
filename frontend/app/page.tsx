"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Clock3, CalendarDays, Wallet, ArrowUpRight, Building2, ShieldCheck,
  CalendarCheck, BriefcaseBusiness, ChevronRight,
  UserPlus, ClipboardList, FileText, ReceiptText, Activity, BarChart3, CheckCircle2, UserRound, Headset,
} from "lucide-react";
import AuthGuard from "./components/AuthGuard";

const modules = [
  {
    title: "Update approvals",
    description: "Review and decide employee data update proposals from Gmail and documents.",
    href: "/employee-update-approvals",
    action: "Review update requests",
    icon: ShieldCheck,
    iconStyle: "bg-emerald-50 text-emerald-700",
    accent: "group-hover:border-emerald-200",
  },
  {
    title: "Employee Documents",
    description: "Send documents to HR or review employee submissions.",
    href: "/documents",
    action: "Open documents",
    icon: FileText,
    iconStyle: "bg-orange-50 text-orange-700",
    accent: "group-hover:border-orange-200",
  },
  {
    title: "Employees",
    description: "Employee profiles, records and account access.",
    href: "/employees",
    action: "Manage employees",
    icon: Users,
    iconStyle: "bg-blue-50 text-blue-700",
    accent: "group-hover:border-blue-200",
  },
  {
    title: "Attendance",
    description: "Daily attendance, check-in and attendance register.",
    href: "/attendance",
    action: "View attendance",
    icon: Clock3,
    iconStyle: "bg-violet-50 text-violet-700",
    accent: "group-hover:border-violet-200",
  },
  {
    title: "Leave Management",
    description: "Review leave requests and manage employee leave.",
    href: "/leaves",
    action: "Manage leaves",
    icon: CalendarDays,
    iconStyle: "bg-amber-50 text-amber-700",
    accent: "group-hover:border-amber-200",
  },
  {
    title: "Payroll",
    description: "Maintain salary structures and process monthly payroll.",
    href: "/payroll",
    action: "Open payroll",
    icon: Wallet,
    iconStyle: "bg-emerald-50 text-emerald-700",
    accent: "group-hover:border-emerald-200",
  },
  {
    title: "Expenses",
    description: "Submit expense claims, review approvals and track reimbursements.",
    href: "/expenses",
    action: "Manage expenses",
    icon: ReceiptText,
    iconStyle: "bg-violet-50 text-violet-700",
    accent: "group-hover:border-violet-200",
  },
  {
    title: "IT support",
    description: "Submit IT support requests and track ticket progress.",
    href: "/helpdesk",
    action: "Open helpdesk",
    icon: Headset,
    iconStyle: "bg-indigo-50 text-indigo-700",
    accent: "group-hover:border-indigo-200",
  },
  {
    title: "Shift Management",
    description: "Configure work timings and employee shift assignments.",
    href: "/shifts",
    action: "Manage shifts",
    icon: CalendarCheck,
    iconStyle: "bg-cyan-50 text-cyan-700",
    accent: "group-hover:border-cyan-200",
  },
  {
    title: "Holiday Calendar",
    description: "View and maintain the company holiday calendar.",
    href: "/holidays",
    action: "View holidays",
    icon: CalendarCheck,
    iconStyle: "bg-rose-50 text-rose-700",
    accent: "group-hover:border-rose-200",
  },
  {
    title: "Organization",
    description: "Manage company departments and designations.",
    href: "/organization",
    action: "Manage organization",
    icon: Building2,
    iconStyle: "bg-indigo-50 text-indigo-700",
    accent: "group-hover:border-indigo-200",
  },
  {
    title: "Recruitment",
    description: "Manage job openings, candidate selection and employee onboarding.",
    href: "/recruitment",
    action: "Manage recruitment",
    icon: UserPlus,
    iconStyle: "bg-fuchsia-50 text-fuchsia-700",
    accent: "group-hover:border-fuchsia-200",
  },
];

const quickActions = [
  { title: "Add employee", href: "/employees/new", icon: UserPlus },
  { title: "Attendance register", href: "/attendance", icon: ClipboardList },
  { title: "Payroll processing", href: "/payroll", icon: Wallet },
];

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

  useEffect(() => {
    const stored = sessionStorage.getItem("hrms_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        const nextRole = user.role || "employee";
        void Promise.resolve().then(() => setRole(nextRole));
      } catch {
        void Promise.resolve().then(() => setRole("employee"));
      }
    }
  }, []);

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
        const response = await fetch(`http://localhost:5000/api/attendance?from=${from}&to=${to}`, {
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
  const isManager = role === "manager";
  const visibleModules = isAdmin
    ? modules
    : modules.filter((item) => ["Employee Documents", "Attendance", "Leave Management", "Payroll", "Expenses", "IT support", "Holiday Calendar"].includes(item.title));
  const visibleQuickActions = isAdmin
    ? quickActions
    : [
        { title: "Apply for leave", href: "/leaves", icon: CalendarDays },
        { title: "My attendance", href: "/attendance", icon: Clock3 },
        { title: "My payslips", href: "/payroll", icon: Wallet },
      ];
  const dashboardTitle = isAdmin
    ? "Dashboard"
    : isManager
      ? "Team"
      : "My workspace";
  const dashboardDescription = isAdmin
    ? "People, attendance and approvals."
    : isManager
      ? "Your team and HR tasks."
      : "Attendance, leave and payslips.";

  return (
    <AuthGuard>
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{dashboardTitle}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{dashboardDescription}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/profile" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                <UserRound size={17} /> Profile
              </Link>
            </div>
          </header>

          <section className="relative mb-7 overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-8 text-white shadow-xl shadow-slate-900/10 sm:px-9 sm:py-10">
            <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[40px] border-white/5" />
            <div className="pointer-events-none absolute right-24 top-16 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative z-10 max-w-2xl">
              <h2 className="mt-5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {isAdmin ? <>People operations,<br className="hidden sm:block" /> made simpler.</> : isManager ? <>Your team,<br className="hidden sm:block" /> in one place.</> : <>Your work,<br className="hidden sm:block" /> in one place.</>}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">{isAdmin ? "Employees, attendance, leave and payroll." : isManager ? "Team leave and your HR records." : "Your attendance, leave and payslips."}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={isAdmin ? "/employees" : "/leaves"} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-blue-50">{isAdmin ? "View employees" : isManager ? "Review team leaves" : "Apply for leave"} <ArrowUpRight size={16} /></Link>
                <Link href="/attendance" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15">{isAdmin ? "Open attendance register" : "My attendance"} <ChevronRight size={16} /></Link>
              </div>
            </div>
            <div className="relative z-10 mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/15 pt-5 sm:absolute sm:bottom-8 sm:right-9 sm:mt-0 sm:w-[390px] sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
              <div><p className="text-xs text-slate-400">Available modules</p><p className="mt-1 text-2xl font-bold">{visibleModules.length.toString().padStart(2, "0")}</p></div>
              <div><p className="text-xs text-slate-400">Workspace</p><p className="mt-1 text-sm font-semibold">Centralized</p></div>
              <div><p className="text-xs text-slate-400">Access</p><p className="mt-1 text-sm font-semibold">Role-based</p></div>
            </div>
          </section>

          {isAdmin && (
            <section className="mb-7">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Attendance dashboard</h2>
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

          <section className="mb-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="mt-1 text-xl font-bold text-slate-900">HR modules</h2></div>
              <span className="text-xs font-medium text-slate-400">{visibleModules.length} modules available</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleModules.map((item, index) => {
                const Icon = item.icon;
                const compactTitle = ({
                  "Update approvals": "Approvals",
                  "Employee Documents": "Documents",
                  "Leave Management": "Leave",
                  "Shift Management": "Shifts",
                  "Holiday Calendar": "Holidays",
                  "IT support": "IT Support",
                } as Record<string, string>)[item.title] || item.title;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ animationDelay: `${index * 55}ms` }}
                    className={`group hrms-module-card flex min-h-[132px] items-center gap-4 rounded-2xl p-5 ${item.accent}`}
                  >
                    <div className={`hrms-module-icon shrink-0 rounded-2xl p-3.5 ${item.iconStyle}`}>
                      <Icon size={23} strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold tracking-tight text-slate-900">{compactTitle}</h3>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                        Open <ChevronRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    </div>
                    <span className="hrms-module-arrow shrink-0 rounded-xl p-2 text-slate-300 transition-colors group-hover:text-blue-700">
                      <ArrowUpRight size={19} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><BriefcaseBusiness size={20} /></div><div><h2 className="font-bold text-slate-900">Quick actions</h2></div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {visibleQuickActions.map((item) => {
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} className="hrms-dashboard-3d-card flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"><span className="flex items-center gap-3"><Icon size={18} className="text-blue-600" />{item.title}</span><ArrowUpRight size={16} className="text-slate-400" /></Link>;
              })}
            </div>
          </section>

          <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-5 text-xs text-slate-400">
            <span>HRMS</span>
            
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}
