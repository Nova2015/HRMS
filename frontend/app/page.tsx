"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Clock3, CalendarDays, Wallet, ArrowUpRight, Building2,
  CalendarCheck, BriefcaseBusiness, LayoutGrid, Sparkles, ChevronRight,
  Settings2, UserPlus, ClipboardList,
} from "lucide-react";
import AuthGuard from "./components/AuthGuard";

const modules = [
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
];

const quickActions = [
  { title: "Add employee", href: "/employees/new", icon: UserPlus },
  { title: "Attendance register", href: "/attendance", icon: ClipboardList },
  { title: "Payroll processing", href: "/payroll", icon: Wallet },
];

export default function Home() {
  const [role, setRole] = useState("employee");

  useEffect(() => {
    const stored = sessionStorage.getItem("hrms_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setRole(user.role || "employee");
      } catch {
        setRole("employee");
      }
    }
  }, []);

  const isAdmin = role === "admin" || role === "hr";
  const isManager = role === "manager";
  const visibleModules = isAdmin
    ? modules
    : modules.filter((item) => ["Attendance", "Leave Management", "Payroll", "Holiday Calendar"].includes(item.title));
  const visibleQuickActions = isAdmin
    ? quickActions
    : [
        { title: "Apply for leave", href: "/leaves", icon: CalendarDays },
        { title: "My attendance", href: "/attendance", icon: Clock3 },
        { title: "My payslips", href: "/payroll", icon: Wallet },
      ];
  const dashboardTitle = isAdmin
    ? "Admin / HR Dashboard"
    : isManager
      ? "Manager Dashboard"
      : "Employee Self-Service";
  const dashboardDescription = isAdmin
    ? "Manage company people operations, records and approvals."
    : isManager
      ? "Manage your team's leave approvals and access your own HR records."
      : "Access your attendance, apply for leave and view your payslips.";

  return (
    <AuthGuard>
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Company workspace
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{dashboardTitle}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{dashboardDescription}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm">
              <LayoutGrid size={17} className="text-blue-600" />
              Single-company workspace
            </div>
          </header>

          <section className="relative mb-7 overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-8 text-white shadow-xl shadow-slate-900/10 sm:px-9 sm:py-10">
            <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[40px] border-white/5" />
            <div className="pointer-events-none absolute right-24 top-16 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative z-10 max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
                <Sparkles size={14} /> Human Resource Management
              </span>
              <h2 className="mt-5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{isAdmin ? "Your company operations,<br className='hidden sm:block' /> in one organized workspace." : isManager ? "Your team and personal HR tasks,<br className='hidden sm:block' /> in one focused workspace." : "Your workday essentials,<br className='hidden sm:block' /> in one simple workspace."}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">{isAdmin ? "Manage employees, attendance, leave, shifts, holidays and payroll." : isManager ? "Review assigned team leave requests and manage your own attendance and payroll." : "Check attendance, apply for leave and view your own payroll records."}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={isAdmin ? "/employees" : "/leaves"} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-blue-50">{isAdmin ? "View employees" : isManager ? "Review team leaves" : "Apply for leave"} <ArrowUpRight size={16} /></Link>
                <Link href="/attendance" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15">{isAdmin ? "Open attendance register" : "My attendance"} <ChevronRight size={16} /></Link>
              </div>
            </div>
            <div className="relative z-10 mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/15 pt-5 sm:absolute sm:bottom-8 sm:right-9 sm:mt-0 sm:w-[390px] sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
              <div><p className="text-xs text-slate-400">Core modules</p><p className="mt-1 text-2xl font-bold">07</p></div>
              <div><p className="text-xs text-slate-400">Workspace</p><p className="mt-1 text-sm font-semibold">Centralized</p></div>
              <div><p className="text-xs text-slate-400">Access</p><p className="mt-1 text-sm font-semibold">Role-based</p></div>
            </div>
          </section>

          <section className="mb-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Workspace</p><h2 className="mt-1 text-xl font-bold text-slate-900">HR modules</h2><p className="mt-1 text-sm text-slate-500">Choose a module to view or manage its records.</p></div>
              <span className="text-xs font-medium text-slate-400">7 modules available</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleModules.map((item) => {
                const roleDescription = item.title === "Leave Management"
                  ? (isAdmin ? "Company-wide leave requests, approvals and calendar." : isManager ? "Review leave requests from your assigned team." : "Apply for leave and track your own requests.")
                  : item.title === "Attendance"
                    ? (isAdmin ? item.description : "View your personal attendance and check-in records.")
                    : item.title === "Payroll" && !isAdmin
                      ? "View your own monthly payroll and payslips."
                      : item.description;
                const roleAction = item.title === "Leave Management"
                  ? (isAdmin ? "Manage company leaves" : isManager ? "Review team leaves" : "Apply for leave")
                  : item.title === "Attendance" && !isAdmin
                    ? "View my attendance"
                    : item.title === "Payroll" && !isAdmin
                      ? "View my payslips"
                      : item.action;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`group flex min-h-[190px] flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70 ${item.accent}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-xl p-3 ${item.iconStyle}`}><Icon size={21} /></div>
                      <span className="rounded-lg p-2 text-slate-300 transition group-hover:bg-slate-50 group-hover:text-slate-700"><ArrowUpRight size={18} /></span>
                    </div>
                    <div className="mt-5"><h3 className="font-bold text-slate-900">{item.title}</h3><p className="mt-1.5 min-h-10 text-sm leading-5 text-slate-500">{roleDescription}</p></div>
                    <div className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-semibold text-blue-700">{roleAction}<ChevronRight size={15} className="transition group-hover:translate-x-1" /></div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><BriefcaseBusiness size={20} /></div><div><h2 className="font-bold text-slate-900">Quick actions</h2><p className="mt-1 text-sm text-slate-500">Jump directly to common HR tasks.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {visibleQuickActions.map((item) => {
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"><span className="flex items-center gap-3"><Icon size={18} className="text-blue-600" />{item.title}</span><ArrowUpRight size={16} className="text-slate-400" /></Link>;
              })}
            </div>
          </section>

          <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-5 text-xs text-slate-400">
            <span>HRMS · Company workspace</span>
            <span className="inline-flex items-center gap-1.5"><Settings2 size={13} /> Manage your organization settings</span>
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}
