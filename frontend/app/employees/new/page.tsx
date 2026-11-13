
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Eye, EyeOff, Crown, Gem } from "lucide-react";
import AuthGuard from "../../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type Department = {
  _id: string;
  name: string;
  code?: string;
  isActive?: boolean;
};

type Designation = {
  _id: string;
  name: string;
  department: string | { _id: string };
  isActive?: boolean;
};

type ManagerOption = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  account: { role: string; isActive: boolean } | null;
};

function AddEmployeeForm() {
  const router = useRouter();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    reportingManager: "",
    joiningDate: new Date().toISOString().slice(0, 10),
    role: "employee",
    initialPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const loadOptions = async () => {
      const token = sessionStorage.getItem("hrms_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [departmentResponse, designationResponse, employeeResponse] = await Promise.all([
          fetch(`${API_URL}/departments`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/designations`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/employees`, { headers, cache: "no-store" }),
        ]);

        const departmentResult = await departmentResponse.json();
        const designationResult = await designationResponse.json();
        const employeeResult = await employeeResponse.json();

        if (
          departmentResponse.status === 401 ||
          designationResponse.status === 401 ||
          employeeResponse.status === 401
        ) {
          sessionStorage.removeItem("hrms_token");
          sessionStorage.removeItem("hrms_user");
          router.replace("/login");
          return;
        }

        if (!departmentResponse.ok || !departmentResult.success) {
          throw new Error(
            departmentResult.message || "Unable to load departments"
          );
        }

        if (!designationResponse.ok || !designationResult.success) {
          throw new Error(
            designationResult.message || "Unable to load designations"
          );
        }

        if (!employeeResponse.ok || !employeeResult.success) {
          throw new Error(employeeResult.message || "Unable to load manager list");
        }

        setDepartments(
          (departmentResult.data || []).filter(
            (item: Department) => item.isActive !== false
          )
        );

        setDesignations(
          (designationResult.data || []).filter(
            (item: Designation) => item.isActive !== false
          )
        );
        setManagers((employeeResult.data || []).filter((item: ManagerOption) =>
          item.employmentStatus === "active" &&
          item.account?.role === "manager" &&
          item.account.isActive
        ));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load form options"
        );
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
  }, [router]);

  const filteredDesignations = designations.filter((item) => {
    const departmentId =
      typeof item.department === "string"
        ? item.department
        : item.department?._id;

    return departmentId === form.department;
  });
  const selectedDesignationName =
    designations.find((item) => item._id === form.designation)?.name || "";
  const isFounderOrCoFounder = /^(co[\s-]?founder|founder)$/i.test(
    selectedDesignationName.trim()
  );

  const updateField = (field: string, value: string) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "department" ? { designation: "", reportingManager: "" } : {}),
      ...(field === "designation" &&
      /^(co[\s-]?founder|founder)$/i.test(
        designations.find((item) => item._id === value)?.name?.trim() || ""
      )
        ? { reportingManager: "" }
        : {}),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.initialPassword.length < 12) {
      setError("Initial password must contain at least 12 characters.");
      return;
    }

    if (form.initialPassword !== form.confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    if (!form.designation || !form.department) {
      setError("Please select department and designation.");
      return;
    }

    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeCode: form.employeeCode,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          department: form.department,
          designation: form.designation,
          joiningDate: form.joiningDate,
          role: form.role,
          reportingManager:
            form.role === "employee" && !isFounderOrCoFounder
              ? form.reportingManager || null
              : null,
          initialPassword: form.initialPassword,
        }),
      });

      const result = await response.json();

      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to create employee");
      }

      setSuccess("Employee and login account created successfully.");

      setTimeout(() => {
        router.push("/employees");
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

  return (
    <main className={`min-h-screen p-4 sm:p-6 ${isFounderOrCoFounder ? selectedDesignationName.toLowerCase() === "founder" ? "bg-slate-100 sm:bg-amber-50/50" : "bg-slate-100 sm:bg-violet-50/50" : "bg-slate-100"}`}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-7">
          <Link
            href="/employees"
            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
          >
            <ArrowLeft size={17} />
            Back to Employees
          </Link>

          <h1 className={`flex items-center gap-2 text-3xl font-bold ${isFounderOrCoFounder ? selectedDesignationName.toLowerCase() === "founder" ? "text-slate-900 sm:text-amber-950" : "text-slate-900 sm:text-violet-950" : "text-slate-900"}`}>
            {isFounderOrCoFounder ? selectedDesignationName.toLowerCase() === "founder" ? <Crown className="hidden text-amber-500 sm:block" /> : <Gem className="hidden text-violet-500 sm:block" /> : null}
            Add Employee
          </h1>

          <p className="mt-2 text-slate-500">
            Create employee record and login account.
          </p>
        </header>

        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className={`rounded-xl border bg-white p-6 shadow-sm ${isFounderOrCoFounder ? selectedDesignationName.toLowerCase() === "founder" ? "border-transparent sm:border-amber-200 sm:shadow-amber-100" : "border-transparent sm:border-violet-200 sm:shadow-violet-100" : "border-transparent"}`}>
            <h2 className="mb-5 text-lg font-semibold text-slate-900">
              Personal & Employment Information
            </h2>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>Employee Code *</label>
                <input
                  required
                  maxLength={30}
                  className={inputClass}
                  value={form.employeeCode}
                  onChange={(e) => updateField("employeeCode", e.target.value)}
                  placeholder="e.g. EMP002"
                />
              </div>

              <div>
                <label className={labelClass}>Joining Date *</label>
                <input
                  required
                  type="date"
                  className={inputClass}
                  value={form.joiningDate}
                  onChange={(e) => updateField("joiningDate", e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  required
                  maxLength={60}
                  className={inputClass}
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>

              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  required
                  maxLength={60}
                  className={inputClass}
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>

              <div>
                <label className={labelClass}>Email Address *</label>
                <input
                  required
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="employee@company.com"
                />
              </div>

              <div>
                <label className={labelClass}>Phone Number</label>
                <input
                  type="tel"
                  maxLength={20}
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label className={labelClass}>Department *</label>
                <select
                  required
                  className={inputClass}
                  value={form.department}
                  onChange={(e) => updateField("department", e.target.value)}
                  disabled={loadingOptions}
                >
                  <option value="">Select Department</option>
                  {departments.map((department) => (
                    <option key={department._id} value={department._id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Designation *</label>
                <select
                  required
                  className={inputClass}
                  value={form.designation}
                  onChange={(e) => updateField("designation", e.target.value)}
                  disabled={!form.department || loadingOptions}
                >
                  <option value="">Select Designation</option>
                  {filteredDesignations.map((designation) => (
                    <option key={designation._id} value={designation._id}>
                      {designation.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isFounderOrCoFounder && (
              <div className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${selectedDesignationName.toLowerCase() === "founder" ? "border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-950" : "border-violet-300 bg-gradient-to-r from-violet-50 to-purple-50 text-violet-950"}`}>
                {selectedDesignationName.toLowerCase() === "founder" ? <Crown size={22} className="mt-0.5 shrink-0 text-amber-600" /> : <Gem size={22} className="mt-0.5 shrink-0 text-violet-600" />}
                <div>
                  <p className="text-sm font-bold">{selectedDesignationName} · Executive Leadership</p>
                  <p className="mt-1 text-xs opacity-80">Special executive profile styling will be applied. Reporting Manager is not required for this designation.</p>
                </div>
              </div>
            )}
            {loadingOptions && (
              <p className="mt-4 text-sm text-slate-500">
                Loading departments and designations...
              </p>
            )}
          </section>

          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold text-slate-900">
              Login Account Information
            </h2>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>Account Role *</label>
                <select
                  required
                  className={inputClass}
                  value={form.role}
                  onChange={(e) => updateField("role", e.target.value)}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr">HR</option>
                </select>
              </div>

              {form.role === "employee" && !isFounderOrCoFounder && (
                <div>
                  <label className={labelClass}>Reporting Manager</label>
                  <select
                    className={inputClass}
                    value={form.reportingManager}
                    onChange={(e) => updateField("reportingManager", e.target.value)}
                  >
                    <option value="">No manager assigned</option>
                    {managers.map((manager) => (
                      <option key={manager._id} value={manager._id}>
                        {manager.firstName} {manager.lastName} ({manager.employeeCode})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">The assigned manager can view and review this employee&apos;s leave requests.</p>
                </div>
              )}

              <div>
                <label className={labelClass}>Initial Password *</label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    minLength={12}
                    autoComplete="new-password"
                    className={`${inputClass} pr-11`}
                    value={form.initialPassword}
                    onChange={(e) =>
                      updateField("initialPassword", e.target.value)
                    }
                    placeholder="Minimum 12 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>Confirm Password *</label>
                <input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  className={inputClass}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    updateField("confirmPassword", e.target.value)
                  }
                  placeholder="Re-enter initial password"
                />
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              The password will be securely hashed before saving. It will not
              be displayed or returned by the API.
            </p>
          </section>

          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href="/employees"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving || loadingOptions}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus size={17} />
              {saving ? "Creating..." : "Create Employee"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function AddEmployeePage() {
  return (
    <AuthGuard>
      <AddEmployeeForm />
    </AuthGuard>
  );
}
