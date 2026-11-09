
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  RefreshCw,
  UserCheck,
  UserX,
} from "lucide-react";
import AuthGuard from "../../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: { _id: string; name: string; code?: string } | null;
  designation: { _id: string; name: string } | null;
  joiningDate: string;
  employmentStatus: "active" | "inactive" | "resigned" | "terminated";
  account: {
    role: string;
    isActive: boolean;
    lastLogin?: string | null;
    email: string;
  } | null;
};

function EmployeeDetails() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEmployee = useCallback(async () => {
    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/employees/${id}`, {
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
        throw new Error(result.message || "Unable to load employee");
      }

      setEmployee(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load employee");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void Promise.resolve().then(loadEmployee);
  }, [loadEmployee]);

  const changeStatus = async (action: "activate" | "deactivate") => {
    if (!employee) return;

    const confirmed = window.confirm(
      action === "deactivate"
        ? "Are you sure you want to deactivate this employee and login account?"
        : "Are you sure you want to activate this employee and login account?"
    );

    if (!confirmed) return;

    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/employees/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update status");
      }

      setMessage(result.message);
      await loadEmployee();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update status");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";

    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const fieldClass = "text-sm font-medium !text-gray-700";
  const valueClass = "mt-1 font-semibold !text-gray-950";

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-8 text-center !text-gray-800">
        Loading employee...
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="!text-red-700">{error || "Employee not found"}</p>
          <Link href="/employees" className="mt-4 inline-block !text-blue-700 hover:!text-blue-900">
            Back to Employees
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 !text-gray-950">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/employees"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium !text-gray-700 hover:!text-blue-700"
        >
          <ArrowLeft size={17} /> Back to Employees
        </Link>

        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold !text-gray-950">Employee Details</h1>
            <p className="mt-2 !text-gray-700">
              View employee and login account information.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadEmployee}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold !text-gray-800 hover:bg-gray-100"
            >
              <RefreshCw size={16} /> Refresh
            </button>

            <Link
              href={`/employees/${id}/edit`}
              className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold !text-white hover:bg-blue-800"
            >
              <Pencil size={16} /> Edit Employee
            </Link>
          </div>
        </header>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm !text-red-800">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm !text-green-800">
            {message}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold !text-gray-950">
                {employee.firstName} {employee.lastName}
              </h2>
              <p className="mt-1 text-sm !text-gray-700">
                {employee.employeeCode}
              </p>
              <p className="mt-1 text-sm !text-gray-700">{employee.email}</p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${
                employee.employmentStatus === "active"
                  ? "bg-green-100 !text-green-800"
                  : employee.employmentStatus === "terminated"
                    ? "bg-red-100 !text-red-800"
                    : employee.employmentStatus === "resigned"
                      ? "bg-orange-100 !text-orange-800"
                      : "bg-gray-200 !text-gray-800"
              }`}
            >
              {employee.employmentStatus}
            </span>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold !text-gray-950">
            Employment Information
          </h2>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className={fieldClass}>First Name</p>
              <p className={valueClass}>{employee.firstName}</p>
            </div>
            <div>
              <p className={fieldClass}>Last Name</p>
              <p className={valueClass}>{employee.lastName}</p>
            </div>
            <div>
              <p className={fieldClass}>Employee Code</p>
              <p className={valueClass}>{employee.employeeCode}</p>
            </div>
            <div>
              <p className={fieldClass}>Email</p>
              <p className={valueClass}>{employee.email}</p>
            </div>
            <div>
              <p className={fieldClass}>Phone</p>
              <p className={valueClass}>{employee.phone || "-"}</p>
            </div>
            <div>
              <p className={fieldClass}>Department</p>
              <p className={valueClass}>{employee.department?.name || "-"}</p>
            </div>
            <div>
              <p className={fieldClass}>Designation</p>
              <p className={valueClass}>{employee.designation?.name || "-"}</p>
            </div>
            <div>
              <p className={fieldClass}>Joining Date</p>
              <p className={valueClass}>{formatDate(employee.joiningDate)}</p>
            </div>
            <div>
              <p className={fieldClass}>Employment Status</p>
              <p className={`${valueClass} capitalize`}>
                {employee.employmentStatus}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold !text-gray-950">
            Login Account
          </h2>

          {employee.account ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className={fieldClass}>Login Email</p>
                <p className={valueClass}>{employee.account.email}</p>
              </div>

              <div>
                <p className={fieldClass}>Role</p>
                <p className={`${valueClass} capitalize`}>
                  {employee.account.role}
                </p>
              </div>

              <div>
                <p className={fieldClass}>Account Status</p>
                <p
                  className={`mt-1 font-bold ${
                    employee.account.isActive
                      ? "!text-green-700"
                      : "!text-red-700"
                  }`}
                >
                  {employee.account.isActive ? "Active" : "Inactive"}
                </p>
              </div>

              <div>
                <p className={fieldClass}>Last Login</p>
                <p className={valueClass}>
                  {formatDate(employee.account.lastLogin)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold !text-orange-800">
              No login account is linked to this employee.
            </p>
          )}
        </section>

        <section className="flex flex-wrap justify-end gap-3">
          {employee.employmentStatus === "active" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => changeStatus("deactivate")}
              className="flex items-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-red-800 disabled:opacity-50"
            >
              <UserX size={17} />
              {saving ? "Please wait..." : "Deactivate"}
            </button>
          ) : employee.employmentStatus === "inactive" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => changeStatus("activate")}
              className="flex items-center gap-2 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-green-800 disabled:opacity-50"
            >
              <UserCheck size={17} />
              {saving ? "Please wait..." : "Activate"}
            </button>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function EmployeeDetailsPage() {
  return (
    <AuthGuard>
      <EmployeeDetails />
    </AuthGuard>
  );
}
