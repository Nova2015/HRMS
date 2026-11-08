
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
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

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
  joiningDate: string;
  employmentStatus: "active" | "inactive" | "resigned" | "terminated";
  account: {
    role: string;
    isActive: boolean;
    email: string;
  } | null;
};

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
    loadEmployees();
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
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Employee Management
            </h1>
            <p className="mt-2 text-slate-500">
              Manage and view all employee records.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={loadEmployees}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={17} />
              Refresh
            </button>

            <Link
              href="/employees/new"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <UserPlus size={17} />
              Add Employee
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-blue-100 p-3">
              <Users className="text-blue-600" size={25} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Employees</p>
              <h2 className="text-2xl font-bold text-slate-900">
                {employees.length}
              </h2>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Employee List
            </h2>
            <p className="text-sm text-slate-500">
              Showing {filteredEmployees.length} of {employees.length}
            </p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code or email..."
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All Departments</option>
              {departments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500">
              Loading employees...
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-5 text-center text-red-700">
              <p>{error}</p>
              <button
                type="button"
                onClick={loadEmployees}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No employees found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Designation</th>
                    <th className="px-4 py-3 font-semibold">Joining Date</th>
                    <th className="px-4 py-3 font-semibold">Employment</th>
                    <th className="px-4 py-3 font-semibold">Account Role</th>
                    <th className="px-4 py-3 font-semibold">Login Account</th>
                    <th className="px-4 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map((employee) => (
                    <tr key={employee._id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {employee.firstName} {employee.lastName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {employee.employeeCode}
                        </p>
                        <p className="text-xs text-slate-500">
                          {employee.email}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {employee.department?.name || "-"}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {employee.designation?.name || "-"}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatDate(employee.joiningDate)}
                      </td>

                      <td className="px-4 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(employee.employmentStatus)}`}>
                          {employee.employmentStatus}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="text-sm font-medium capitalize text-slate-700">
                          {employee.account?.role || "No account"}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        {employee.account ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            employee.account.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {employee.account.isActive ? "Active" : "Inactive"}
                          </span>
                        ) : (
                          <span className="text-xs text-orange-600">
                            Not linked
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            title="View Employee"
                            onClick={() => router.push(`/employees/${employee._id}`)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye size={18} />
                          </button>

                          <button
                            type="button"
                            title="Edit Employee"
                            onClick={() => router.push(`/employees/${employee._id}/edit`)}
                            className="text-slate-600 hover:text-slate-900"
                          >
                            <Pencil size={18} />
                          </button>
                        </div>
                      </td>
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

export default function EmployeesPage() {
  return (
    <AuthGuard>
      <EmployeeList />
    </AuthGuard>
  );
}
