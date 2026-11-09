import {
  Users,
  Clock,
  CalendarDays,
  Wallet,
} from "lucide-react";

const stats = [
  {
    title: "Total Employees",
    value: "248",
    icon: Users,
  },
  {
    title: "Present Today",
    value: "221",
    icon: Clock,
  },
  {
    title: "Leave Requests",
    value: "12",
    icon: CalendarDays,
  },
  {
    title: "Monthly Payroll",
    value: "₹28.5L",
    icon: Wallet,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-6">

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          HRMS Dashboard
        </h1>

        <p className="mt-2 text-slate-500">
          Human Resource Management System
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

        {stats.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {item.title}
                </p>

                <Icon className="h-6 w-6 text-blue-600" />
              </div>

              <h2 className="mt-4 text-3xl font-bold text-slate-900">
                {item.value}
              </h2>
            </div>
          );
        })}

      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Employee Overview
          </h2>

          <p className="mt-3 text-slate-500">
            Employee analytics will appear here.
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Attendance Overview
          </h2>

          <p className="mt-3 text-slate-500">
            Attendance analytics will appear here.
          </p>
        </div>

      </section>

    </main>
  );
}