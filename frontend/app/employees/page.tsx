
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Search,
  RefreshCw,
  UserPlus,
  Eye,
  Pencil,
  Crown,
  Gem,
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type Department = {
  _id: string;
  name: string;
  code?: string;
};

type Designation = {
  _id: string;
  name: string;
};

type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: Department | null;
  designation: Designation | null;
  reportingManager?: { firstName: string; lastName: string } | null;
  joiningDate: string;
  employmentStatus: "active" | "inactive" | "resigned" | "terminated";
  account: {
    role: string;
    isActive: boolean;
    email: string;
  } | null;
};

function getExecutiveType(name?: string | null): "founder" | "cofounder" | null {
  const normalized = name?.trim().toLowerCase().replace(/[\s-]+/g, "") || "";
  if (normalized === "founder") return "founder";
  if (normalized === "cofounder") return "cofounder";
  return null;
}

function EmployeeList() {
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/employees`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const result = await response.json();

      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load employees");
      }

      setEmployees(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(loadEmployees);
  }, [loadEmployees]);

  const departments = useMemo(() => {
    const unique = new Map<string, Department>();

    employees.forEach((employee) => {
      if (employee.department?._id) {
        unique.set(employee.department._id, employee.department);
      }
    });

    return Array.from(unique.values());
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const fullName =
        `${employee.firstName} ${employee.lastName}`.toLowerCase();

      const term = search.toLowerCase();

      const searchMatch =
        fullName.includes(term) ||
        employee.employeeCode.toLowerCase().includes(term) ||
        employee.email.toLowerCase().includes(term);

      const departmentMatch =
        departmentFilter === "all" ||
        employee.department?._id === departmentFilter;

      const statusMatch =
        statusFilter === "all" ||
        employee.employmentStatus === statusFilter;

      return searchMatch && departmentMatch && statusMatch;
    });
  }, [employees, search, departmentFilter, statusFilter]);

  const formatDate = (date: string) => {
    if (!date) return "-";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const statusClass = (status: Employee["employmentStatus"]) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "inactive":
        return "bg-slate-100 text-slate-700";
      case "resigned":
        return "bg-orange-100 text-orange-700";
      case "terminated":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <main className="min-h-full px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_18px_55px_rgba(31,41,55,0.07)] backdrop-blur-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200">
                <Users size={23} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">People directory</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Employee Management</h2>
                <p className="mt-1 text-sm text-slate-500">Manage employee records, departments and account access.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={loadEmployees}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <Link
                href="/employees/new"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <UserPlus size={17} />
                Add Employee
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_10px_30px_rgba(31,41,55,0.05)] backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Total employees</p>
              <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Users size={19} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{employees.length}</p>
            <p className="mt-1 text-xs text-slate-400">All employee records</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_10px_30px_rgba(31,41,55,0.05)] backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Active employees</p>
              <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><Users size={19} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{employees.filter((employee) => employee.employmentStatus === "active").length}</p>
            <p className="mt-1 text-xs text-slate-400">Currently employed</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_10px_30px_rgba(31,41,55,0.05)] backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Inactive accounts</p>
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><Users size={19} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{employees.filter((employee) => employee.account && !employee.account.isActive).length}</p>
            <p className="mt-1 text-xs text-slate-400">Login access disabled</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_10px_30px_rgba(31,41,55,0.05)] backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Unlinked accounts</p>
              <span className="rounded-xl bg-rose-50 p-2.5 text-rose-600"><Users size={19} /></span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{employees.filter((employee) => !employee.account).length}</p>
            <p className="mt-1 text-xs text-slate-400">Employee without login</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/80 shadow-[0_18px_55px_rgba(31,41,55,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Employee directory</h3>
              <p className="mt-1 text-xs text-slate-500">Search, filter and manage your workforce.</p>
            </div>
            <p className="text-sm font-medium text-slate-500">Showing <span className="font-bold text-slate-800">{filteredEmployees.length}</span> of {employees.length}</p>
          </div>

          <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:px-6">
            <div className="relative">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code or email..."
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="all">All Departments</option>
              {departments.map((department) => (
                <option key={department._id} value={department._id}>{department.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            >
              <option value="all">All Employment Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <RefreshCw size={22} className="animate-spin text-indigo-500" />
              Loading employee records...
            </div>
          ) : error ? (
            <div className="m-5 rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center text-sm text-rose-700">
              <p>{error}</p>
              <button type="button" onClick={loadEmployees} className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700">Try Again</button>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Users size={25} /></div>
              <p className="mt-4 font-semibold text-slate-700">No employees found</p>
              <p className="mt-1 text-sm text-slate-400">Try changing your search or filter criteria.</p>
            </div>
          ) : (
            <>
            <div className="space-y-3 p-4 sm:hidden">
              {filteredEmployees.map((employee) => (
                <article key={employee._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-sm font-bold uppercase text-indigo-700">
                      {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="flex flex-wrap items-center gap-1.5 truncate text-sm font-bold text-slate-900">{employee.firstName} {employee.lastName}</h4>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">{employee.employeeCode}</p>
                        </div>
                        <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClass(employee.employmentStatus)}`}>{employee.employmentStatus}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{employee.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Department</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-700">{employee.department?.name || "-"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Designation</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-700">{employee.designation?.name || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={`text-[11px] font-medium ${employee.account?.isActive ? "text-emerald-700" : employee.account ? "text-rose-700" : "text-amber-700"}`}>
                      {employee.account ? (employee.account.isActive ? "Login active" : "Login inactive") : "No login account"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => router.push(`/employees/${employee._id}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                        <Eye size={14} /> View
                      </button>
                      <button type="button" onClick={() => router.push(`/employees/${employee._id}/edit`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                        <Pencil size={14} /> Edit
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-b-3xl sm:block">
              <table className="hrms-employee-table w-full min-w-[1080px] text-left text-[13px] 2xl:min-w-full">
                <thead className="bg-slate-50/95 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5 font-bold">Employee</th>
                    <th className="px-3 py-3.5 font-bold">Department</th>
                    <th className="px-3 py-3.5 font-bold">Designation</th>
                    <th className="px-3 py-3.5 font-bold">Reporting Manager</th>
                    <th className="px-3 py-3.5 font-bold">Joining Date</th>
                    <th className="px-3 py-3.5 font-bold">Employment</th>
                    <th className="px-3 py-3.5 font-bold">Account Role</th>
                    <th className="px-3 py-3.5 font-bold">Login Account</th>
                    <th className="px-4 py-3 text-center font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/90">
                  {filteredEmployees.map((employee) => (
                    <tr key={employee._id} className={`group transition-colors ${getExecutiveType(employee.designation?.name) === "founder" ? "bg-amber-50/70 hover:bg-amber-100/70" : getExecutiveType(employee.designation?.name) === "cofounder" ? "bg-violet-50/70 hover:bg-violet-100/70" : "hover:bg-indigo-50/40"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase ${getExecutiveType(employee.designation?.name) === "founder" ? "bg-amber-100 text-amber-700" : getExecutiveType(employee.designation?.name) === "cofounder" ? "bg-violet-100 text-violet-700" : "bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700"}`}>
                            {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 truncate font-semibold text-slate-800">{employee.firstName} {employee.lastName}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{employee.employeeCode}</p>
                            <p className="max-w-[210px] truncate text-xs text-slate-500">{employee.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{employee.department?.name || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{employee.designation?.name || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{employee.reportingManager ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}` : <span className="text-slate-400">Not assigned</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(employee.joiningDate)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(employee.employmentStatus)}`}>{employee.employmentStatus}</span>
                      </td>
                      <td className="px-3 py-3 font-medium capitalize text-slate-600">{employee.account?.role || "No account"}</td>
                      <td className="px-3 py-3">
                        {employee.account ? (
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${employee.account.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{employee.account.isActive ? "Active" : "Inactive"}</span>
                        ) : <span className="text-xs font-medium text-amber-600">Not linked</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" title="View Employee" aria-label={`View ${employee.firstName} ${employee.lastName}`} onClick={() => router.push(`/employees/${employee._id}`)} className="rounded-lg border border-transparent p-2 text-indigo-600 transition hover:border-indigo-100 hover:bg-white hover:shadow-sm">
                            <Eye size={17} />
                          </button>
                          <button type="button" title="Edit Employee" aria-label={`Edit ${employee.firstName} ${employee.lastName}`} onClick={() => router.push(`/employees/${employee._id}/edit`)} className="rounded-lg border border-transparent p-2 text-slate-500 transition hover:border-slate-200 hover:bg-white hover:text-slate-800 hover:shadow-sm">
                            <Pencil size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
        <p className="pb-2 text-center text-xs text-slate-400">Employee records are managed securely within your HRMS workspace.</p>
      </div>
    </main>
  );
}

export default function EmployeesPage() {
  return (
    <AuthGuard>
      <EmployeeList />
    </AuthGuard>
  );
}
