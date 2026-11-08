"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  LogIn,
  LogOut,
  RefreshCw,
  CalendarDays,
  ClipboardCheck,
  Save,
  ArrowLeft,
} from "lucide-react";

import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type AttendanceRecord = {
  _id: string;
  dateKey: string;
  checkIn: string | null;
  checkOut: string | null;
  workMinutes: number;
  status: "present" | "half-day" | "absent";
  isLate: boolean;
  isEarlyLeaving: boolean;
  notes?: string;
  source?: string;
  employee?: {
    _id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
};

type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
};

const getLocalDate = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatTime = (value: string | null) => {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
};

const statusStyle = (status: string) => {
  switch (status) {
    case "present":
      return "bg-green-100 text-green-700";

    case "half-day":
      return "bg-orange-100 text-orange-700";

    case "absent":
      return "bg-red-100 text-red-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
};

function AttendanceContent() {
  const router = useRouter();

  const [role, setRole] = useState("employee");
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [selectedDate, setSelectedDate] = useState(getLocalDate().slice(0, 7));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [manualForm, setManualForm] = useState({
    employeeId: "",
    dateKey: getLocalDate(),
    status: "present",
    checkIn: "",
    checkOut: "",
    notes: "",
  });

  const isAdmin = role === "admin" || role === "hr";

  const getToken = () => {
    const token = sessionStorage.getItem("hrms_token");

    if (!token) {
      router.replace("/login");
      return null;
    }

    return token;
  };

  const apiRequest = async (
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const token = getToken();

    if (!token) {
      throw new Error("Session expired. Please login again.");
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      cache: "no-store",
    });

    const result = await response.json();

    if (response.status === 401) {
      sessionStorage.removeItem("hrms_token");
      sessionStorage.removeItem("hrms_user");
      router.replace("/login");

      throw new Error("Session expired. Please login again.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Request failed");
    }

    return result;
  };

  const loadToday = useCallback(async () => {
    const result = await apiRequest("/attendance/today");
    setToday(result.data || null);
  }, []);


  const loadRecords = useCallback(async () => {
      if (isAdmin) {
        const [year, month] = selectedDate.split("-");
        const lastDay = new Date(
          Number(year),
          Number(month),
          0
        ).getDate();

        const from = `${year}-${month}-01`;
        const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

        const result = await apiRequest(
          `/attendance?from=${from}&to=${to}`
        );

        setRecords(result.data || []);
      } else {
        const result = await apiRequest("/attendance/me");

        setRecords(result.data || []);
      }
    }, [isAdmin, selectedDate]);


  const loadEmployees = useCallback(async () => {
    if (!isAdmin) return;

    const result = await apiRequest("/employees");

    setEmployees(
      (result.data || []).filter(
        (employee: {
          _id: string;
          employeeCode: string;
          firstName: string;
          lastName: string;
          employmentStatus: string;
        }) => employee.employmentStatus === "active"
      )
    );
  }, [isAdmin]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
        loadToday(),
        loadRecords(),
        loadEmployees(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load attendance"
      );
    } finally {
      setLoading(false);
    }
  }, [loadToday, loadRecords, loadEmployees]);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("hrms_user");

    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setRole(user.role || "employee");
      } catch {
        setRole("employee");
      }
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleAttendanceAction = async (
    action: "check-in" | "check-out"
  ) => {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await apiRequest(
        `/attendance/${action}`,
        {
          method: "POST",
        }
      );

      setMessage(result.message || "Attendance updated successfully.");

      await Promise.all([
        loadToday(),
        loadRecords(),
      ]);

    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Attendance action failed"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleManualSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (!manualForm.employeeId) {
        throw new Error("Please select an employee.");
      }

      const checkIn = manualForm.checkIn
        ? new Date(manualForm.checkIn).toISOString()
        : null;

      const checkOut = manualForm.checkOut
        ? new Date(manualForm.checkOut).toISOString()
        : null;

      const result = await apiRequest("/attendance/manual", {
        method: "POST",
        body: JSON.stringify({
          employeeId: manualForm.employeeId,
          dateKey: manualForm.dateKey,
          status: manualForm.status,
          checkIn,
          checkOut,
          notes: manualForm.notes,
        }),
      });

      setMessage(result.message || "Attendance saved successfully.");

      setSelectedDate(manualForm.dateKey.slice(0, 7));

      await loadToday();
      await loadRecords();

    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save attendance"
      );
    } finally {
      setSaving(false);
    }
  };

  const updateManualField = (
    field: string,
    value: string
  ) => {
    setManualForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "status" && value === "absent"
        ? { checkIn: "", checkOut: "" }
        : {}),
    }));
  };

  const completedToday = Boolean(today?.checkOut);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">

        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
            >
              <ArrowLeft size={16} />
              Back to Dashboard
            </Link>

            <h1 className="text-3xl font-bold text-slate-900">
              Attendance Management
            </h1>

            <p className="mt-2 text-slate-500">
              Check-in, check-out and attendance records.
            </p>
          </div>

          <button
            type="button"
            onClick={loadPage}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            {message}
          </div>
        )}

        {/* TODAY'S ATTENDANCE */}
        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-3">
              <Clock size={24} className="text-blue-600" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Today's Attendance
              </h2>

              <p className="text-sm text-slate-500">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {loading ? (
            <p className="py-6 text-center text-slate-500">
              Loading attendance...
            </p>
          ) : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Check-In</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">
                    {formatTime(today?.checkIn || null)}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Check-Out</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">
                    {formatTime(today?.checkOut || null)}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Working Hours</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">
                    {formatMinutes(today?.workMinutes || 0)}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Status</p>
                  <p className="mt-2 text-xl font-bold capitalize text-slate-900">
                    {today?.status || "Not Checked In"}
                  </p>
                </div>

              </div>

              <div className="flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() => handleAttendanceAction("check-in")}
                  disabled={saving || Boolean(today?.checkIn)}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn size={18} />
                  {today?.checkIn ? "Checked In" : "Check In"}
                </button>

                <button
                  type="button"
                  onClick={() => handleAttendanceAction("check-out")}
                  disabled={
                    saving ||
                    !today?.checkIn ||
                    completedToday
                  }
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut size={18} />
                  {completedToday ? "Checked Out" : "Check Out"}
                </button>

              </div>

              {today?.isLate && (
                <p className="mt-4 text-sm font-semibold text-orange-700">
                  Late arrival recorded.
                </p>
              )}

              {today?.isEarlyLeaving && (
                <p className="mt-2 text-sm font-semibold text-orange-700">
                  Early leaving recorded.
                </p>
              )}
            </>
          )}
        </section>

        {/* ADMIN / HR MANUAL ATTENDANCE */}
        {isAdmin && (
          <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">

            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-3">
                <Save size={23} className="text-purple-600" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Manual Attendance Entry / Correction
                </h2>

                <p className="text-sm text-slate-500">
                  Admin and HR only.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleManualSubmit}
              className="grid gap-5 md:grid-cols-2"
            >

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Employee *
                </label>

                <select
                  required
                  value={manualForm.employeeId}
                  onChange={(e) =>
                    updateManualField("employeeId", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                >
                  <option value="">Select Employee</option>

                  {employees.map((employee) => (
                    <option key={employee._id} value={employee._id}>
                      {employee.employeeCode} - {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Attendance Date *
                </label>

                <input
                  required
                  type="date"
                  value={manualForm.dateKey}
                  onChange={(e) =>
                    updateManualField("dateKey", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Attendance Status *
                </label>

                <select
                  required
                  value={manualForm.status}
                  onChange={(e) =>
                    updateManualField("status", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                >
                  <option value="present">Present</option>
                  <option value="half-day">Half-Day</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Check-In Time
                </label>

                <input
                  type="datetime-local"
                  value={manualForm.checkIn}
                  disabled={manualForm.status === "absent"}
                  onChange={(e) =>
                    updateManualField("checkIn", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Check-Out Time
                </label>

                <input
                  type="datetime-local"
                  value={manualForm.checkOut}
                  disabled={manualForm.status === "absent"}
                  onChange={(e) =>
                    updateManualField("checkOut", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Notes
                </label>

                <input
                  type="text"
                  maxLength={500}
                  value={manualForm.notes}
                  onChange={(e) =>
                    updateManualField("notes", e.target.value)
                  }
                  placeholder="Reason for manual correction"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={saving || employees.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  <Save size={17} />
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </div>

            </form>
          </section>
        )}

        {/* ATTENDANCE REGISTER / HISTORY */}
        <section className="rounded-xl bg-white p-6 shadow-sm">

          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">

            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-3">
                <ClipboardCheck size={23} className="text-blue-600" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {isAdmin ? "Attendance Register" : "My Attendance History"}
                </h2>

                <p className="text-sm text-slate-500">
                  {isAdmin
                    ? "Employee attendance records"
                    : "Your recorded attendance"}
                </p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-slate-500" />

                <input
                  type="month"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}

          </div>

          {loading ? (
            <p className="py-10 text-center text-slate-500">
              Loading records...
            </p>
          ) : records.length === 0 ? (
            <p className="py-10 text-center text-slate-500">
              No attendance records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">

                <thead className="border-b bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>

                    {isAdmin && (
                      <th className="px-4 py-3 font-semibold">
                        Employee
                      </th>
                    )}

                    <th className="px-4 py-3 font-semibold">Check-In</th>
                    <th className="px-4 py-3 font-semibold">Check-Out</th>
                    <th className="px-4 py-3 font-semibold">Working Hours</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Remarks</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">

                  {records.map((record) => (
                    <tr key={record._id} className="hover:bg-slate-50">

                      <td className="px-4 py-4 font-medium text-slate-800">
                        {record.dateKey}
                      </td>

                      {isAdmin && (
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {record.employee?.firstName} {record.employee?.lastName}
                          </p>

                          <p className="text-xs text-slate-500">
                            {record.employee?.employeeCode}
                          </p>
                        </td>
                      )}

                      <td className="px-4 py-4 text-slate-700">
                        {formatTime(record.checkIn)}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatTime(record.checkOut)}
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        {formatMinutes(record.workMinutes || 0)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyle(record.status)}`}
                        >
                          {record.status}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {record.isLate && (
                            <p className="text-xs font-semibold text-orange-700">
                              Late
                            </p>
                          )}

                          {record.isEarlyLeaving && (
                            <p className="text-xs font-semibold text-orange-700">
                              Early Leaving
                            </p>
                          )}

                          {record.source === "manual" && (
                            <p className="text-xs font-semibold text-purple-700">
                              Manual Entry
                            </p>
                          )}

                          {record.notes && (
                            <p className="max-w-xs text-xs text-slate-500">
                              {record.notes}
                            </p>
                          )}

                          {!record.isLate &&
                            !record.isEarlyLeaving &&
                            record.source !== "manual" &&
                            !record.notes && "-"}
                        </div>
                      </td>

                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          )}

        </section>

        <p className="mt-5 text-xs text-slate-500">
          Attendance timezone: Asia/Kolkata. Late arrival is recorded after
          09:15 AM. Early leaving is recorded before 06:00 PM.
        </p>

      </div>
    </main>
  );
}

export default function AttendancePage() {
  return (
    <AuthGuard>
      <AttendanceContent />
    </AuthGuard>
  );
}