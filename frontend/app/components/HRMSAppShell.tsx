"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Award, BarChart3, BriefcaseBusiness, Building2, CalendarDays,
  CalendarCheck, ClipboardList, FileText, Headset, LayoutDashboard,
  LogOut, Menu, ReceiptText, Settings, ShieldCheck, Users, Wallet, UserCircle2,
} from "lucide-react";

type Props = {
  children: React.ReactNode;
  onLogout: () => void;
  showLogout?: boolean;
};

const adminLinks = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Attendance", href: "/attendance", icon: ClipboardList },
  { label: "Leave Management", href: "/leaves", icon: CalendarDays },
  { label: "Payroll", href: "/payroll", icon: Wallet },
  { label: "Expenses", href: "/expenses", icon: ReceiptText },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "IT Support", href: "/helpdesk", icon: Headset },
  { label: "Shift Management", href: "/shifts", icon: CalendarCheck },
  { label: "Holiday Calendar", href: "/holidays", icon: CalendarCheck },
  { label: "Organization", href: "/organization", icon: Building2 },
  { label: "Performance", href: "/performance", icon: Award },
  { label: "Recruitment", href: "/recruitment", icon: BriefcaseBusiness },
  { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
  { label: "Audit Logs", href: "/audit-logs", icon: ShieldCheck },
  { label: "Update Approvals", href: "/employee-update-approvals", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
];

const employeeLinks = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Attendance", href: "/attendance", icon: ClipboardList },
  { label: "Leave Management", href: "/leaves", icon: CalendarDays },
  { label: "Payroll", href: "/payroll", icon: Wallet },
  { label: "Expenses", href: "/expenses", icon: ReceiptText },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "IT Support", href: "/helpdesk", icon: Headset },
  { label: "Holiday Calendar", href: "/holidays", icon: CalendarCheck },
  { label: "Performance", href: "/performance", icon: Award },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function HRMSAppShell({ children, onLogout, showLogout = true }: Props) {
  const pathname = usePathname() || "/";
  const [role, setRole] = useState("employee");
  const [displayName, setDisplayName] = useState("Workspace user");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
      setDisplayName(name || user.name || user.email || "Workspace user");
    } catch {
      setRole("employee");
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const isAdmin = role === "admin" || role === "hr";
  const links = isAdmin ? adminLinks : employeeLinks;
  const active = useMemo(() => links.find((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(item.href + "/")))?.href || (pathname === "/" ? "/" : ""), [links, pathname]);
  const pageTitle = links.find((item) => item.href === active)?.label || (pathname === "/" ? "Dashboard" : "HRMS Workspace");
  const sidebar = (
    <aside className="flex h-full w-[258px] shrink-0 flex-col border-r border-white/70 bg-white/75 px-4 py-5 shadow-[8px_0_40px_-32px_rgba(71,85,105,.35)] backdrop-blur-2xl">
      <Link href="/" className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-1.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 text-lg font-black text-white shadow-lg shadow-indigo-500/20">H</span>
        <span><span className="block text-[17px] font-black tracking-tight text-slate-900">HRMS</span><span className="block text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">People workspace</span></span>
      </Link>

      <div className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[.2em] text-slate-400">Workspace</div>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {links.map(({ label, href, icon: Icon }) => {
          const selected = href === "/" ? pathname === "/" : active === href;
          return (
            <Link key={href} href={href} aria-current={selected ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 ${selected ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20" : "text-slate-600 hover:translate-x-0.5 hover:bg-indigo-50 hover:text-indigo-700"}`}>
              <Icon size={17} strokeWidth={selected ? 2.4 : 1.9} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/80 p-3.5">
        <div className="flex items-center gap-2 text-indigo-700"><Activity size={15} /><span className="text-[11px] font-bold">HRMS workspace</span></div>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Your people operations, organized in one place.</p>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-200/70 px-2 pt-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UserCircle2 size={19} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{displayName}</span><span className="block text-[10px] capitalize text-slate-400">{role}</span></span>
      </div>
    </aside>
  );

  return (
    <div className="hrms-app-shell min-h-screen bg-[radial-gradient(ellipse_at_top_left,_rgba(224,231,255,.75),_transparent_42%),radial-gradient(ellipse_at_bottom_right,_rgba(237,233,254,.6),_transparent_38%),linear-gradient(135deg,#f8fafc_0%,#f3f5fb_52%,#f8faff_100%)]">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}
      {mobileOpen && <div className="fixed inset-y-0 left-0 z-50 lg:hidden">{sidebar}</div>}
      <div className="min-h-screen lg:pl-[258px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-white/70 bg-white/65 px-4 shadow-[0_8px_30px_-28px_rgba(15,23,42,.35)] backdrop-blur-2xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-600 shadow-sm lg:hidden"><Menu size={18} /></button>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-indigo-500">Human resources</p><h1 className="truncate text-[16px] font-extrabold tracking-tight text-slate-800">{pageTitle}</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-[10px] font-bold text-emerald-700 sm:inline-flex">Workspace active</span>
            <Link href="/profile" title="Profile" aria-label="Profile" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white bg-white/85 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-indigo-600"><UserCircle2 size={18} /></Link>
            {showLogout && <button type="button" onClick={onLogout} title="Logout" aria-label="Logout" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white bg-white/85 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50 hover:text-rose-600"><LogOut size={17} /></button>}
          </div>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
