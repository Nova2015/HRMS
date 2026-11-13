
"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import AuthGuard from "../../../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type Department = {
  _id: string;
  name: string;
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

type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: { _id: string } | null;
  designation: { _id: string } | null;
  reportingManager: { _id: string } | null;
  joiningDate: string;
  employmentStatus: "active" | "inactive" | "resigned" | "terminated";
};

function EditEmployeeForm() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    joiningDate: "",
    employmentStatus: "active",
  });

  const loadData = useCallback(async () => {
    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [employeeResponse, departmentResponse, designationResponse, employeesResponse] =
        await Promise.all([
          fetch(`${API_URL}/employees/${id}`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/departments`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/designations`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/employees`, { headers, cache: "no-store" }),
        ]);

      const [employeeResult, departmentResult, designationResult, employeesResult] =
        await Promise.all([
          employeeResponse.json(),
          departmentResponse.json(),
          designationResponse.json(),
          employeesResponse.json(),
        ]);

      if (
        employeeResponse.status === 401 ||
        departmentResponse.status === 401 ||
        designationResponse.status === 401 ||
        employeesResponse.status === 401
      ) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
        return;
      }

      if (!employeeResponse.ok || !employeeResult.success) {
        throw new Error(employeeResult.message || "Unable to load employee");
      }

      if (!departmentResponse.ok || !departmentResult.success) {
        throw new Error(departmentResult.message || "Unable to load departments");
      }

      if (!designationResponse.ok || !designationResult.success) {
        throw new Error(designationResult.message || "Unable to load designations");
      }
      if (!employeesResponse.ok || !employeesResult.success) {
        throw new Error(employeesResult.message || "Unable to load manager list");
      }

      const employee: Employee = employeeResult.data;

      setForm({
        employeeCode: employee.employeeCode || "",
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        email: employee.email || "",
        phone: employee.phone || "",
        department: employee.department?._id || "",
        designation: employee.designation?._id || "",
        reportingManager: employee.reportingManager?._id || "",
        joiningDate: employee.joiningDate
          ? new Date(employee.joiningDate).toISOString().slice(0, 10)
          : "",
        employmentStatus: employee.employmentStatus || "active",
      });

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
      setManagers((employeesResult.data || []).filter((item: ManagerOption) =>
        item._id !== id &&
        item.employmentStatus === "active" &&
        item.account?.role === "manager" &&
        item.account.isActive
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

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

    if (!form.department || !form.designation) {
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
      const response = await fetch(`${API_URL}/employees/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          department: form.department,
          designation: form.designation,
          joiningDate: form.joiningDate,
          employmentStatus: form.employmentStatus,
          reportingManager: isFounderOrCoFounder ? null : form.reportingManager || null,
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
        throw new Error(result.message || "Unable to update employee");
      }

      setSuccess("Employee updated successfully.");

      setTimeout(() => {
        router.push(`/employees/${id}`);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update employee");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-8 text-center text-slate-500">
        Loading employee...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/employees/${id}`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft size={17} /> Back to Employee Details
        </Link>

        <header className="mb-7">
          <h1 className="text-3xl font-bold text-slate-900">Edit Employee</h1>
          <p className="mt-2 text-slate-500">
            Update employee information and employment status.
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

        {!error || form.employeeCode ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-lg font-semibold text-slate-900">
                Employee Information
              </h2>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Employee Code</label>
                  <input
                    readOnly
                    className={`${inputClass} bg-slate-100 text-slate-500`}
                    value={form.employeeCode}
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
                  />
                </div>

                <div>
                  <label className={labelClass}>Department *</label>
                  <select
                    required
                    className={inputClass}
                    value={form.department}
                    onChange={(e) => updateField("department", e.target.value)}
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
                    disabled={!form.department}
                  >
                    <option value="">Select Designation</option>
                    {filteredDesignations.map((designation) => (
                      <option key={designation._id} value={designation._id}>
                        {designation.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!isFounderOrCoFounder && (
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
                  <p className="mt-1 text-xs text-slate-500">Manager access to this employee&apos;s leave records follows this assignment.</p>
                </div>
                )}

                <div>
                  <label className={labelClass}>Employment Status *</label>
                  <select
                    required
                    className={inputClass}
                    value={form.employmentStatus}
                    onChange={(e) =>
                      updateField("employmentStatus", e.target.value)
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="resigned">Resigned</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href={`/employees/${id}`}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={17} />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl bg-white p-6 text-slate-600 shadow-sm">
            Employee information could not be loaded. Please go back and try again.
          </div>
        )}
      </div>
    </main>
  );
}

export default function EditEmployeePage() {
  return (
    <AuthGuard>
      <EditEmployeeForm />
    </AuthGuard>
  );
}
