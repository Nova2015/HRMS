
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
  KeyRound,
  Crown,
  Gem,
} from "lucide-react";
import AuthGuard from "../../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

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
  const [userRole, setUserRole] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadEmployee = useCallback(async () => {
    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const storedUser = sessionStorage.getItem("hrms_user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUserRole(typeof parsedUser.role === "string" ? parsedUser.role : "");
      }
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

  const resetEmployeePassword = async () => {
    if (!employee || userRole !== "admin") return;

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    if (newPassword.length < 12 || new TextEncoder().encode(newPassword).length > 72) {
      setError("Temporary password must be at least 12 characters and no more than 72 UTF-8 bytes.");
      return;
    }

    const confirmed = window.confirm(
      `Reset the login password for ${employee.firstName} ${employee.lastName}? Their existing sessions will be signed out.`
    );
    if (!confirmed) return;

    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    setResettingPassword(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/employees/${id}/reset-password`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword }),
      });

      const result = await response.json();

      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to reset employee password");
      }

      setMessage(result.message);
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset employee password");
    } finally {
      setResettingPassword(false);
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
  const executiveType = employee?.designation?.name?.trim().toLowerCase() === "founder"
    ? "founder"
    : (employee?.designation?.name?.trim().toLowerCase().replace(/[\s-]+/g, "") || "") === "cofounder"
      ? "cofounder"
      : null;
  const executiveTheme = executiveType === "founder"
    ? "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-yellow-50"
    : executiveType === "cofounder"
      ? "border-violet-300 bg-gradient-to-br from-violet-50 via-white to-purple-50"
      : "border-gray-200 bg-white";

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

        <section className={`mb-6 rounded-2xl border p-6 shadow-sm ${executiveTheme}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className={`flex flex-wrap items-center gap-2 text-2xl font-bold ${executiveType === "founder" ? "text-amber-950" : executiveType === "cofounder" ? "text-violet-950" : "!text-gray-950"}`}>
                {employee.firstName} {employee.lastName}
                {executiveType === "founder" ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-800"><Crown size={13} /> Founder · Executive</span> : executiveType === "cofounder" ? <span className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-violet-800"><Gem size={13} /> Co-Founder · Executive</span> : null}
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

        <section className={`mb-6 rounded-xl border p-6 shadow-sm ${executiveType ? executiveTheme : "border-gray-200 bg-white"}`}>
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

          {employee.account && userRole === "admin" && (
            <div className="mt-6 border-t border-gray-200 pt-5">
              {!showPasswordReset ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMessage("");
                    setShowPasswordReset(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold !text-amber-900 hover:bg-amber-100"
                >
                  <KeyRound size={16} /> Reset Password
                </button>
              ) : (
                <div className="max-w-xl space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div>
                    <h3 className="font-semibold !text-gray-950">Set Temporary Password</h3>
                    <p className="mt-1 text-sm !text-gray-700">
                      Set a new password and share it securely with the employee. Their existing sessions will be signed out.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="employee-new-password" className="mb-1 block text-sm font-medium !text-gray-800">
                      New temporary password
                    </label>
                    <input
                      id="employee-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={12}
                      maxLength={72}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm !text-gray-950 outline-none focus:border-amber-500"
                      placeholder="At least 12 characters"
                    />
                  </div>
                  <div>
                    <label htmlFor="employee-confirm-password" className="mb-1 block text-sm font-medium !text-gray-800">
                      Confirm temporary password
                    </label>
                    <input
                      id="employee-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      minLength={12}
                      maxLength={72}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm !text-gray-950 outline-none focus:border-amber-500"
                      placeholder="Re-enter temporary password"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={resetEmployeePassword}
                      disabled={resettingPassword || !newPassword || !confirmPassword}
                      className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold !text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      {resettingPassword ? "Resetting..." : "Confirm Password Reset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordReset(false);
                        setNewPassword("");
                        setConfirmPassword("");
                        setError("");
                      }}
                      disabled={resettingPassword}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold !text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
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
