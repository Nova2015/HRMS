import Link from "next/link";
import {
  Users,
  Clock,
  CalendarDays,
  Wallet,
  ArrowRight,
} from "lucide-react";
import AuthGuard from "./components/AuthGuard";

const stats = [
  { title: "Total Employees", value: "248", icon: Users },
  { title: "Present Today", value: "221", icon: Clock },
  { title: "Leave Requests", value: "12", icon: CalendarDays },
  { title: "Monthly Payroll", value: "₹28.5L", icon: Wallet },
];

export default function Home() {
  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-100 p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">HRMS Dashboard</h1>
          <p className="mt-2 text-slate-500">Human Resource Management System</p>
        </header>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{item.title}</p>
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="mt-4 text-3xl font-bold text-slate-900">{item.value}</h2>
              </div>
            );
          })}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <Link href="/employees" className="block rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Employee Overview</h2>
              <ArrowRight className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-3 text-slate-500">Employee analytics will appear here.</p>
            <p className="mt-4 text-sm font-medium text-blue-600">Manage Employees</p>
          </Link>

          <Link href="/attendance" className="block rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Attendance Overview</h2>
              <ArrowRight className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-3 text-slate-500">Attendance analytics will appear here.</p>
            <p className="mt-4 text-sm font-medium text-blue-600">Manage Attendance</p>
          </Link>

          <Link href="/leaves" className="block rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Leave Management</h2>
              <ArrowRight className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-3 text-slate-500">Apply for leave and review employee requests.</p>
            <p className="mt-4 text-sm font-medium text-blue-600">Manage Leaves</p>
          </Link>
          <Link href="/holidays" className="block rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Holiday Calendar</h2>
              <ArrowRight className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-3 text-slate-500">View and manage company holidays.</p>
            <p className="mt-4 text-sm font-medium text-blue-600">Manage Holidays</p>
          </Link>
          <Link href="/organization" className="block rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Organization Structure</h2>
              <ArrowRight className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-3 text-slate-500">Configure company departments and designations.</p>
            <p className="mt-4 text-sm font-medium text-blue-600">Manage Organization</p>
          </Link>
        </section>
      </main>
    </AuthGuard>
  );
}
