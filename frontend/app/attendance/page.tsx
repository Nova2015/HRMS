"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3,
  LogIn, LogOut, Save, Users, CheckCircle2,
  AlertCircle, Timer, CalendarCheck2, X, RefreshCw
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";
import CalendarExportActions from "./CalendarExportActions";
import CalendarImportActions from "./CalendarImportActions";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type Role = "admin" | "hr" | "manager" | "employee";
type ApiResponse = { data?: unknown; message?: string };
type AttendanceStatus = "present" | "half-day" | "absent";
type AttendanceRecord = {
  _id: string;
  dateKey: string;
  checkIn: string | null;
  checkOut: string | null;
  workMinutes: number;
  status: AttendanceStatus;
  isLate: boolean;
  isEarlyLeaving: boolean;
  notes?: string;
  source?: string;
  employee?: {
    _id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
};
type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  shift?: { weeklyOffDays: number[] } | null;
};
type Holiday = {
  _id: string;
  name: string;
  dateKey: string;
  type: "public" | "optional" | "company";
  description?: string;
  isActive: boolean;
};
type CompanyEvent = {
  _id: string;
  title: string;
  description?: string;
  eventType: "meeting" | "company_event" | "training" | "other";
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  status: "scheduled" | "cancelled";
};
type LeaveRequest = {
  _id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  employee?: { firstName: string; lastName: string; employeeCode: string };
};

const pad = (value: number) => String(value).padStart(2, "0");
const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayKey = () => localDateKey(new Date());
const monthKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const formatTime = (value: string | null) => value
  ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  : "—";
const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  return `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const formatHours = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const statusClass: Record<AttendanceStatus, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "half-day": "border-amber-200 bg-amber-50 text-amber-700",
  absent: "border-rose-200 bg-rose-50 text-rose-700",
};

function AttendanceWorkspace() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("employee");
  const [roleReady, setRoleReady] = useState(false);
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayManagerItems, setHolidayManagerItems] = useState<Holiday[]>([]);
  const [holidayYear, setHolidayYear] = useState(String(new Date().getFullYear()));
  const [holidayManagerLoading, setHolidayManagerLoading] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayEditId, setHolidayEditId] = useState<string | null>(null);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ name: "", dateKey: todayKey(), type: "public" as Holiday["type"], description: "" });
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);
  const [showDayDetails, setShowDayDetails] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventEditId, setEventEditId] = useState<string | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "", description: "", eventType: "company_event" as CompanyEvent["eventType"],
    startAt: "", endAt: "", allDay: false, location: "",
  });
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "earned", startDate: todayKey(), endDate: todayKey(), reason: "" });
  const [ownWeeklyOffDays, setOwnWeeklyOffDays] = useState<number[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [clockTime, setClockTime] = useState(() => new Date());
  const previousDateRef = useRef(currentDate);
  const hoverPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPreviewHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverPreviewClosing, setHoverPreviewClosing] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ day: string; top: number; left: number } | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [manualForm, setManualForm] = useState({
    employeeId: "", dateKey: todayKey(), status: "present",
    checkIn: "", checkOut: "", notes: "",
  });

  // Keep the document behind any calendar popup from scrolling.
  useEffect(() => {
    if (!showDayDetails && !showLeaveModal && !showEventForm && !showHolidayModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showDayDetails, showLeaveModal, showEventForm, showHolidayModal]);

  const isAdmin = role === "admin" || role === "hr";
  const isManager = role === "manager";
  const canSeeTeam = isAdmin || isManager;
  const monthStart = `${monthKey(month)}-01`;
  const monthEnd = localDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.replace("/login");
      throw new Error("Please login again.");
    }
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
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
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, [router]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const range = `from=${monthStart}&to=${monthEnd}`;
      const attendancePath = canSeeTeam
        ? `/attendance?${range}${employeeFilter ? `&employeeId=${encodeURIComponent(employeeFilter)}` : ""}`
        : `/attendance/me?${range}`;
      const requests: Promise<ApiResponse>[] = [
        apiRequest("/attendance/today"),
        apiRequest(attendancePath),
        apiRequest(`/holidays?${range}${isAdmin ? "&includeInactive=true" : ""}`),
        apiRequest("/auth/me"),
        apiRequest("/leaves"),
        apiRequest(`/calendar/events?from=${encodeURIComponent(new Date(`${monthStart}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${monthEnd}T23:59:59.999`).toISOString())}`),
      ];
      if (canSeeTeam) requests.push(apiRequest("/attendance/team"));
      const results = await Promise.all(requests);
      setToday((results[0].data as AttendanceRecord | null | undefined) || null);
      setRecords((results[1].data as AttendanceRecord[] | undefined) || []);
      setHolidays((results[2].data as Holiday[] | undefined) || []);
      setLeaves((results[4].data as LeaveRequest[] | undefined) || []);
      setCompanyEvents((results[5].data as CompanyEvent[] | undefined) || []);
      const authData = results[3].data as { employee?: { shift?: { weeklyOffDays?: number[] } | null } } | undefined;
      setOwnWeeklyOffDays(authData?.employee?.shift?.weeklyOffDays || []);
      if (canSeeTeam) setEmployees((results[6].data as Employee[] | undefined) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load attendance workspace");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, canSeeTeam, employeeFilter, monthStart, monthEnd, isAdmin]);

  const loadHolidayManager = useCallback(async (selectedYear = holidayYear) => {
    setHolidayManagerLoading(true);
    try {
      const result = await apiRequest(`/holidays?year=${encodeURIComponent(selectedYear)}&includeInactive=true`);
      setHolidayManagerItems((result.data as Holiday[] | undefined) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load holiday list.");
    } finally {
      setHolidayManagerLoading(false);
    }
  }, [apiRequest, holidayYear]);

  useEffect(() => {
    if (showHolidayModal) void loadHolidayManager();
  }, [showHolidayModal, loadHolidayManager]);

  const importCalendarRows = useCallback(async (rows: Array<{ category: "holiday" | "event"; date: string; name: string; type: string; description: string; startAt: string; endAt: string; location: string; allDay: boolean }>) => {
    const dates = rows.map((row) => row.category === "holiday" ? row.date : row.startAt.slice(0, 10));
    const from = `${dates.reduce((a, b) => a < b ? a : b)}T00:00:00`;
    const toDate = new Date(`${dates.reduce((a, b) => a > b ? a : b)}T00:00:00`);
    toDate.setDate(toDate.getDate() + 1);
    const to = toDate.toISOString();
    const [holidayResult, eventResult] = await Promise.all([
      apiRequest(`/holidays?from=${from.slice(0, 10)}&to=${to.slice(0, 10)}`),
      apiRequest(`/calendar/events?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(to)}`),
    ]);
    const existingHolidays = (holidayResult.data || []) as Holiday[];
    const existingEvents = (eventResult.data || []) as CompanyEvent[];
    let created = 0, updated = 0, skipped = 0;
    for (const row of rows) {
      if (row.category === "holiday") {
        const match = existingHolidays.find((item) => item.dateKey === row.date && item.name.trim().toLowerCase() === row.name.trim().toLowerCase());
        const payload = { name: row.name, dateKey: row.date, type: row.type, description: row.description };
        if (match?._id) {
          await apiRequest(`/holidays/${match._id}`, { method: "PUT", body: JSON.stringify(payload) });
          updated++;
        } else {
          await apiRequest("/holidays", { method: "POST", body: JSON.stringify(payload) });
          created++;
        }
      } else {
        const startAt = new Date(row.startAt).toISOString();
        const endAt = new Date(row.endAt).toISOString();
        const match = existingEvents.find((item) => item.title.trim().toLowerCase() === row.name.trim().toLowerCase() && new Date(item.startAt).toISOString() === startAt);
        const payload = { title: row.name, eventType: row.type, description: row.description, startAt, endAt, allDay: row.allDay, location: row.location, status: "scheduled" };
        if (match?._id) {
          await apiRequest(`/calendar/events/${match._id}`, { method: "PUT", body: JSON.stringify(payload) });
          updated++;
        } else {
          await apiRequest("/calendar/events", { method: "POST", body: JSON.stringify(payload) });
          created++;
        }
      }
    }
    await loadWorkspace();
    return { created, updated, skipped };
  }, [apiRequest, loadWorkspace]);

  const syncGoogleCalendar = async () => {
    setGoogleSyncing(true); setError(""); setNotice("");
    try {
      const status = await apiRequest("/integrations/google/calendar/status");
      if (!status.connected) {
        const connection = await apiRequest("/integrations/google/gmail/connect");
        if (!connection.authorizationUrl) throw new Error("Unable to start Google Calendar authorization.");
        setNotice("Google Calendar permission is required. Complete the Google consent screen to connect.");
        window.location.assign(connection.authorizationUrl);
        return;
      }
      const result = await apiRequest("/integrations/google/calendar/sync", {
        method: "POST",
        body: JSON.stringify({
          from: new Date(`${monthStart}T00:00:00`).toISOString(),
          to: new Date(`${monthEnd}T23:59:59.999`).toISOString(),
        }),
      });
      const summary = result.data || {};
      setNotice(`Google Calendar sync complete — ${summary.imported || 0} imported, ${summary.pulledUpdates || 0} updated from Google, ${summary.pushed || 0} sent to Google, ${summary.cancelled || 0} cancelled.`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Calendar sync failed.");
    } finally {
      setGoogleSyncing(false);
    }
  };

  useEffect(() => {
    let nextRole: Role = "employee";
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      nextRole = (["admin", "hr", "manager", "employee"].includes(user.role) ? user.role : "employee") as Role;
    } catch {
      nextRole = "employee";
    }
    void Promise.resolve().then(() => {
      setRole(nextRole);
      setRoleReady(true);
    });
  }, []);

  useEffect(() => {
    if (roleReady) void Promise.resolve().then(loadWorkspace);
  }, [loadWorkspace, roleReady]);

  // Keep the Today marker in sync when the page remains open across midnight.
  useEffect(() => {
    const syncCurrentDate = () => { const now = new Date(); setCurrentDate(now); setClockTime(now); };
    const timer = window.setInterval(syncCurrentDate, 1_000);
    window.addEventListener("focus", syncCurrentDate);
    document.addEventListener("visibilitychange", syncCurrentDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncCurrentDate);
      document.removeEventListener("visibilitychange", syncCurrentDate);
    };
  }, []);

  useEffect(() => {
    const previousDate = previousDateRef.current;
    const previousKey = localDateKey(previousDate);
    const nextKey = localDateKey(currentDate);
    if (previousKey !== nextKey) {
      setSelectedDay((selected) => selected === previousKey ? nextKey : selected);
      setMonth((visibleMonth) =>
        monthKey(visibleMonth) === monthKey(previousDate)
          ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
          : visibleMonth
      );
      if (roleReady) void Promise.resolve().then(loadWorkspace);
    }
    previousDateRef.current = currentDate;
  }, [currentDate, loadWorkspace, roleReady]);

  const performAttendanceAction = async (action: "check-in" | "check-out") => {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest(`/attendance/${action}`, { method: "POST" });
      setNotice(result.message || "Attendance updated.");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attendance action failed");
    } finally { setSaving(false); }
  };

  const submitLeaveRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLeaveSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest("/leaves", { method: "POST", body: JSON.stringify(leaveForm) });
      setNotice(result.message || "Leave request submitted successfully.");
      setShowLeaveModal(false);
      setLeaveForm({ leaveType: "earned", startDate: selectedDay, endDate: selectedDay, reason: "" });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit leave request.");
    } finally { setLeaveSaving(false); }
  };

  const openLeaveForDate = (date: string) => {
    setSelectedDay(date);
    setLeaveForm({ leaveType: "earned", startDate: date, endDate: date, reason: "" });
    setShowLeaveModal(true);
    setError(""); setNotice("");
  };

  const submitCompanyEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEventSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest(eventEditId ? `/calendar/events/${eventEditId}` : "/calendar/events", {
        method: eventEditId ? "PUT" : "POST",
        body: JSON.stringify({
          ...eventForm,
          startAt: new Date(eventForm.startAt).toISOString(),
          endAt: new Date(eventForm.endAt).toISOString(),
        }),
      });
      setNotice(result.message || (eventEditId ? "Calendar event updated successfully." : "Calendar event created successfully."));
      setShowEventForm(false);
      setEventEditId(null);
      setEventForm({ title: "", description: "", eventType: "company_event", startAt: "", endAt: "", allDay: false, location: "" });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create calendar event.");
    } finally { setEventSaving(false); }
  };

  const openEventEditor = (event: CompanyEvent) => {
    setEventEditId(event._id);
    setEventForm({
      title: event.title,
      description: event.description || "",
      eventType: event.eventType,
      startAt: toLocalDateTimeInput(event.startAt),
      endAt: toLocalDateTimeInput(event.endAt),
      allDay: event.allDay,
      location: event.location || "",
    });
    setShowEventForm(true);
    setError("");
    setNotice("");
  };

  const removeCompanyEvent = async (event: CompanyEvent) => {
    if (!window.confirm(`Delete calendar event "${event.title}"?`)) return;
    setEventSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest(`/calendar/events/${event._id}`, { method: "DELETE" });
      setNotice(result.message || "Calendar event deleted successfully.");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete calendar event.");
    } finally { setEventSaving(false); }
  };

  const submitHoliday = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHolidaySaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest(holidayEditId ? `/holidays/${holidayEditId}` : "/holidays", {
        method: holidayEditId ? "PUT" : "POST",
        body: JSON.stringify({
          name: holidayForm.name.trim(),
          dateKey: holidayForm.dateKey,
          type: holidayForm.type,
          description: holidayForm.description.trim(),
        }),
      });
      setNotice(result.message || (holidayEditId ? "Holiday updated successfully." : "Holiday created successfully."));
      setHolidayEditId(null);
      setHolidayForm({ name: "", dateKey: selectedDay, type: "public", description: "" });
      await loadWorkspace();
      setHolidayYear(holidayForm.dateKey.slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save holiday.");
    } finally { setHolidaySaving(false); }
  };

  const editHoliday = (holiday: Holiday) => {
    setHolidayEditId(holiday._id);
    setHolidayForm({ name: holiday.name, dateKey: holiday.dateKey, type: holiday.type, description: holiday.description || "" });
  };

  const toggleHolidayStatus = async (holiday: Holiday) => {
    setHolidaySaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest(`/holidays/${holiday._id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !holiday.isActive }),
      });
      setNotice(result.message || `Holiday ${holiday.isActive ? "deactivated" : "activated"} successfully.`);
      await loadWorkspace();
      await loadHolidayManager();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update holiday status.");
    } finally { setHolidaySaving(false); }
  };

  const removeHoliday = async (holiday: Holiday) => {
    if (!window.confirm(`Delete holiday "${holiday.name}"?`)) return;
    setHolidaySaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest(`/holidays/${holiday._id}`, { method: "DELETE" });
      setNotice(result.message || "Holiday deleted successfully.");
      await loadWorkspace();
      await loadHolidayManager();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete holiday.");
    } finally { setHolidaySaving(false); }
  };

  const submitCorrection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualForm.employeeId) {
      setError("Select an employee first.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const checkIn = manualForm.checkIn ? new Date(manualForm.checkIn).toISOString() : null;
      const checkOut = manualForm.checkOut ? new Date(manualForm.checkOut).toISOString() : null;
      const result = await apiRequest("/attendance/manual", {
        method: "POST",
        body: JSON.stringify({ ...manualForm, checkIn, checkOut }),
      });
      setNotice(result.message || "Attendance correction saved.");
      setShowCorrection(false);
      setSelectedDay(manualForm.dateKey);
      setMonth(new Date(`${manualForm.dateKey}T00:00:00`));
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save attendance correction");
    } finally { setSaving(false); }
  };

  const calendarCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = first.getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < offset; i++) {
      const d = new Date(first); d.setDate(d.getDate() - offset + i);
      cells.push({ key: localDateKey(d), day: d.getDate(), inMonth: false });
    }
    for (let day = 1; day <= count; day++) {
      const d = new Date(month.getFullYear(), month.getMonth(), day);
      cells.push({ key: localDateKey(d), day, inMonth: true });
    }
    while (cells.length % 7) {
      const d = new Date(`${cells[cells.length - 1].key}T00:00:00`);
      d.setDate(d.getDate() + 1);
      cells.push({ key: localDateKey(d), day: d.getDate(), inMonth: false });
    }
    return cells;
  }, [month]);

  const isWeeklyOffDate = (dateKey: string) => {
    const weekday = new Date(`${dateKey}T00:00:00`).getDay();
    if (!canSeeTeam) return ownWeeklyOffDays.includes(weekday);
    if (employeeFilter) {
      return employees.find((employee) => employee._id === employeeFilter)?.shift?.weeklyOffDays?.includes(weekday) || false;
    }
    return isManager && employees.length > 0 &&
      employees.every((employee) => employee.shift?.weeklyOffDays?.includes(weekday));
  };
  const selectedWeeklyOff = isWeeklyOffDate(selectedDay);
  const selectedIsSunday = new Date(`${selectedDay}T00:00:00`).getDay() === 0;
  const currentDateKey = localDateKey(currentDate);

  const selectedRecords = records.filter((record) => record.dateKey === selectedDay);
  const selectedLeaves = leaves.filter((leave) => leave.status === "pending" || leave.status === "approved").filter((leave) => leave.startDate <= selectedDay && leave.endDate >= selectedDay);
  const selectedHoliday = holidays.filter((holiday) => holiday.dateKey === selectedDay && holiday.isActive);
  const selectedEvents = companyEvents.filter((event) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const dayStart = new Date(`${selectedDay}T00:00:00`);
    const dayEnd = new Date(`${selectedDay}T23:59:59.999`);
    return event.status === "scheduled" && start <= dayEnd && end >= dayStart;
  });
  const summary = useMemo(() => ({
    present: records.filter((record) => record.status === "present").length,
    halfDay: records.filter((record) => record.status === "half-day").length,
    absent: records.filter((record) => record.status === "absent").length,
    late: records.filter((record) => record.isLate).length,
    hours: records.reduce((total, record) => total + (record.workMinutes || 0), 0),
  }), [records]);

  const title = isAdmin ? "Attendance Management" : isManager ? "Team Attendance" : "My Attendance";
  const subtitle = isAdmin
    ? "Company-wide attendance calendar, employee register and corrections."
    : isManager
      ? "Attendance calendar for your assigned team and your own records."
      : "Your monthly attendance calendar, working hours and daily records.";

  const selectedLabel = new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <>
      <style jsx global>{`@keyframes calendarPreviewIn { from { opacity: 0; transform: translateY(7px) scale(0.96); filter: blur(5px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } } @keyframes calendarPreviewOut { from { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } to { opacity: 0; transform: translateY(5px) scale(0.97); filter: blur(7px); } }`}</style>
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 p-3 text-white shadow-lg shadow-blue-600/20"><CalendarDays size={25} /></div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-right shadow-sm backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Local time</p>
              <p className="text-sm font-bold tabular-nums text-slate-800">{clockTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</p>
            </div>
            {!today?.checkIn ? <button type="button" onClick={() => performAttendanceAction("check-in")} disabled={saving || loading} className="hrms-interactive inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50"><LogIn size={16} />{saving ? "Processing..." : "Punch In"}</button> : !today.checkOut ? <button type="button" onClick={() => performAttendanceAction("check-out")} disabled={saving || loading} className="hrms-interactive inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50"><LogOut size={16} />{saving ? "Processing..." : "Punch Out"}</button> : <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">Shift completed</span>}
                      </div>
        </header>

        {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

        {isAdmin && (
          <section className="relative mb-6 overflow-hidden rounded-[30px] border border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/80 to-sky-50/80 p-6 shadow-[0_20px_60px_rgba(79,70,229,0.10)] sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-1/3 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
            <div className="relative grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-indigo-700 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 hrms-pulse" />
                  Admin attendance workspace
                </div>
                <p className="text-sm font-semibold text-slate-500">{currentDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                <h2 className="mt-2 max-w-xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Company attendance, at a glance.</h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">Monitor recorded attendance, review late arrivals and manage employee records from one workspace.</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-white/90 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Live local time</p>
                    <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900">{clockTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</p>
                  </div>
                  <div className="rounded-2xl border border-white/90 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Selected period</p>
                    <p className="mt-1 text-base font-bold text-slate-900">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                  </div>
                  <button type="button" onClick={() => setShowCorrection((value) => !value)} className="hrms-interactive inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white/90 px-4 py-3 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"><Save size={16} /> {showCorrection ? "Close correction" : "Manual correction"}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/90 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between text-emerald-700"><span className="text-xs font-semibold">Present</span><CheckCircle2 size={18} /></div>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{summary.present}</p>
                  <p className="mt-1 text-xs text-slate-500">Recorded this month</p>
                </div>
                <div className="rounded-2xl border border-white/90 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between text-orange-700"><span className="text-xs font-semibold">Late arrivals</span><Clock3 size={18} /></div>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{summary.late}</p>
                  <p className="mt-1 text-xs text-slate-500">This month</p>
                </div>
                <div className="col-span-2 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-600 to-blue-600 p-4 text-white shadow-lg shadow-indigo-600/15">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs font-semibold text-indigo-100">Total recorded working time</p><p className="mt-1 text-3xl font-bold tabular-nums">{formatHours(summary.hours)}</p></div>
                    <div className="rounded-xl bg-white/15 p-3"><CalendarCheck2 size={25} /></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {!isAdmin && (
          <section className="hrms-card mb-6 overflow-hidden rounded-[28px] p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  <span className={`h-2 w-2 rounded-full ${today?.checkIn && !today?.checkOut ? "bg-emerald-500 hrms-pulse" : "bg-slate-400"}`} />
                  {today?.checkOut ? "Shift completed" : today?.checkIn ? "Currently checked in" : "Attendance workspace"}
                </div>
                <p className="text-sm font-medium text-slate-500">{currentDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                <div className="mt-1 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{clockTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</div>
                <p className="mt-2 text-sm text-slate-500">Your attendance actions and today&apos;s recorded hours.</p>
                <div className="mt-5 text-xs font-semibold text-indigo-600">Use the Punch In / Punch Out controls above to record today&apos;s attendance.</div>
                {(today?.isLate || today?.isEarlyLeaving) && <p className="mt-3 text-xs font-semibold text-orange-700">{today.isLate ? "Late arrival recorded. " : ""}{today.isEarlyLeaving ? "Early leaving recorded." : ""}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-2.5 sm:rounded-2xl sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check-in</p><p className="mt-1 text-base font-bold text-slate-900 sm:mt-2 sm:text-xl">{formatTime(today?.checkIn || null)}</p><p className="mt-1 text-xs text-slate-400">Today</p></div>
                <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check-out</p><p className="mt-2 text-xl font-bold text-slate-900">{formatTime(today?.checkOut || null)}</p><p className="mt-1 text-xs text-slate-400">Today</p></div>
                <div className="col-span-2 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Total working time</p><p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{formatHours(today?.workMinutes || 0)}</p></div>
              </div>
            </div>
          </section>
        )}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="hrms-card rounded-2xl p-5">
            <div className="flex items-center justify-between text-blue-100"><span className="text-sm font-medium">Present</span><CheckCircle2 size={20} /></div>
            <p className="mt-3 text-3xl font-bold tabular-nums">{summary.present}</p><p className="mt-1 text-xs text-blue-100">Recorded days this month</p>
          </div>
          <div className="hrms-card rounded-2xl p-5"><div className="flex items-center justify-between text-amber-700"><span className="text-sm font-medium">Half Day</span><Timer size={20} /></div><p className="mt-3 text-3xl font-bold text-slate-900">{summary.halfDay}</p><p className="mt-1 text-xs text-slate-500">Short working days</p></div>
          <div className="hrms-card rounded-2xl p-5"><div className="flex items-center justify-between text-rose-700"><span className="text-sm font-medium">Absent</span><AlertCircle size={20} /></div><p className="mt-3 text-3xl font-bold text-slate-900">{summary.absent}</p><p className="mt-1 text-xs text-slate-500">Explicitly marked absent</p></div>
          <div className="hrms-card rounded-2xl p-5"><div className="flex items-center justify-between text-orange-700"><span className="text-sm font-medium">Late Arrivals</span><Clock3 size={20} /></div><p className="mt-3 text-3xl font-bold text-slate-900">{summary.late}</p><p className="mt-1 text-xs text-slate-500">Late check-ins this month</p></div>
          <div className="hrms-card rounded-2xl p-5"><div className="flex items-center justify-between text-emerald-700"><span className="text-sm font-medium">Working Time</span><Clock3 size={20} /></div><p className="mt-3 text-2xl font-bold text-slate-900">{formatHours(summary.hours)}</p><p className="mt-1 text-xs text-slate-500">Total recorded hours</p></div>
        </section>

        {canSeeTeam && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Users size={18} className="text-indigo-600" /> Attendance scope</div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,360px)_1fr]">
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
                <option value="">{isAdmin ? "All company employees" : "All assigned team members"}</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.employeeCode} · {employee.firstName} {employee.lastName}</option>)}
              </select>
              <p className="self-center text-xs text-slate-500">Choose an employee to focus the calendar. {isAdmin ? "Admin/HR can view the entire company." : "Managers can only view their assigned team."}</p>
            </div>
          </section>
        )}

        {isManager && <div className="mb-6 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><Users size={17} /> Showing your assigned reporting team and your own attendance only.</div>}

        {isAdmin && showCorrection && (
          <section className="mb-6 rounded-2xl border border-violet-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Manual Attendance Entry / Correction</h2><p className="mt-1 text-sm text-slate-500">Create or correct a single employee attendance record.</p></div><button type="button" onClick={() => setShowCorrection(false)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button></div>
            <form onSubmit={submitCorrection} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">Employee *<select required value={manualForm.employeeId} onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.employeeCode} · {employee.firstName} {employee.lastName}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Date *<input required type="date" value={manualForm.dateKey} onChange={(e) => setManualForm({ ...manualForm, dateKey: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-medium text-slate-700">Status *<select value={manualForm.status} onChange={(e) => setManualForm({ ...manualForm, status: e.target.value, ...(e.target.value === "absent" ? { checkIn: "", checkOut: "" } : {}) })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"><option value="present">Present</option><option value="half-day">Half Day</option><option value="absent">Absent</option></select></label>
              <label className="text-sm font-medium text-slate-700">Check-in<input type="datetime-local" disabled={manualForm.status === "absent"} value={manualForm.checkIn} onChange={(e) => setManualForm({ ...manualForm, checkIn: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Check-out<input type="datetime-local" disabled={manualForm.status === "absent"} value={manualForm.checkOut} onChange={(e) => setManualForm({ ...manualForm, checkOut: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal disabled:bg-slate-50" /></label>
              <label className="text-sm font-medium text-slate-700">Notes<input maxLength={500} value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Correction reason" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <div className="sm:col-span-2 lg:col-span-3"><button disabled={saving || !employees.length} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50">{saving ? "Saving..." : "Save Attendance"}</button></div>
            </form>
          </section>
        )}

        {isAdmin && showHolidayModal && <div className="fixed inset-0 z-[105] grid place-items-center overflow-hidden bg-slate-950/50 p-4 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHolidayModal(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="calendar-holiday-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.3)] sm:p-7">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-rose-600">Attendance Calendar</p><h3 id="calendar-holiday-title" className="mt-1 text-xl font-extrabold text-slate-950">Holiday management</h3><p className="mt-1 text-sm text-slate-500">Manage holidays for any year, including active and inactive dates.</p></div><button type="button" aria-label="Close holiday manager" onClick={() => { setShowHolidayModal(false); setHolidayEditId(null); }} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200"><X size={18} /></button></div>
            <form onSubmit={submitHoliday} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Holiday name *<input required maxLength={120} value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. Diwali" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100" /></label>
              <label className="text-sm font-semibold text-slate-700">Date *<input required type="date" value={holidayForm.dateKey} onChange={(e) => setHolidayForm({ ...holidayForm, dateKey: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold text-slate-700">Type<select value={holidayForm.type} onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value as Holiday["type"] })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="public">Public holiday</option><option value="optional">Optional holiday</option><option value="company">Company holiday</option></select></label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Description<textarea maxLength={500} rows={2} value={holidayForm.description} onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })} placeholder="Optional details..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <div className="flex justify-end gap-2 border-b border-slate-100 pb-4 sm:col-span-2"><button type="button" onClick={() => { setHolidayEditId(null); setHolidayForm({ name: "", dateKey: selectedDay, type: "public", description: "" }); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Clear</button><button type="submit" disabled={holidaySaving || !holidayForm.name.trim()} className="rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50">{holidaySaving ? "Saving..." : holidayEditId ? "Update holiday" : "Add holiday"}</button></div>
            </form>
            <div className="mt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-extrabold text-slate-900">Holiday list</h4><p className="text-xs text-slate-500">Active holidays appear on the calendar. Inactive holidays remain saved.</p></div><div className="flex items-center gap-2"><label htmlFor="holiday-year" className="text-xs font-semibold text-slate-600">Year</label><select id="holiday-year" value={holidayYear} onChange={(e) => setHolidayYear(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 3 + i).map((year) => <option key={year} value={String(year)}>{year}</option>)}</select></div></div>{holidayManagerLoading ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">Loading holidays...</p> : holidayManagerItems.length ? <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{holidayManagerItems.map((holiday) => <div key={holiday._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{holiday.name}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(`${holiday.dateKey}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · {holiday.type} · <span className={holiday.isActive ? "font-semibold text-emerald-700" : "font-semibold text-slate-400"}>{holiday.isActive ? "Active" : "Inactive"}</span></p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => editHoliday(holiday)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Edit</button><button type="button" disabled={holidaySaving} onClick={() => void toggleHolidayStatus(holiday)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{holiday.isActive ? "Deactivate" : "Activate"}</button><button type="button" disabled={holidaySaving} onClick={() => void removeHoliday(holiday)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Delete</button></div></div>)}</div> : <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No holidays found for {holidayYear}.</p>}</div>
            <div className="mt-5 flex justify-end"><button type="button" onClick={() => { setShowHolidayModal(false); setHolidayEditId(null); }} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">Close</button></div>
          </section>
        </div>}
        {isAdmin && showEventForm && <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-slate-950/50 p-4 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowEventForm(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="company-event-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.3)] sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-violet-600">Attendance Calendar</p><h3 id="company-event-title" className="mt-1 text-xl font-extrabold text-slate-950">{eventEditId ? "Edit event / meeting" : "Add event / meeting"}</h3><p className="mt-1 text-sm text-slate-500">This will appear on the existing Attendance Calendar.</p></div><button type="button" aria-label="Close event form" onClick={() => { setShowEventForm(false); setEventEditId(null); }} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200"><X size={18} /></button></div>
            <form onSubmit={submitCompanyEvent} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Title *<input required maxLength={140} value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="e.g. Monthly town hall" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></label>
              <label className="text-sm font-semibold text-slate-700">Type *<select value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value as CompanyEvent["eventType"] })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="company_event">Company event</option><option value="meeting">Meeting</option><option value="training">Training</option><option value="other">Other</option></select></label>
              <label className="text-sm font-semibold text-slate-700">Location<input maxLength={200} value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Meeting room / online" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold text-slate-700">Start *<input required type="datetime-local" value={eventForm.startAt} onChange={(e) => setEventForm({ ...eventForm, startAt: e.target.value, endAt: eventForm.endAt && eventForm.endAt <= e.target.value ? "" : eventForm.endAt })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold text-slate-700">End *<input required type="datetime-local" min={eventForm.startAt || undefined} value={eventForm.endAt} onChange={(e) => setEventForm({ ...eventForm, endAt: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={eventForm.allDay} onChange={(e) => setEventForm({ ...eventForm, allDay: e.target.checked })} />All-day event</label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Description<textarea maxLength={2000} rows={3} value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Optional details..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2"><button type="button" onClick={() => { setShowEventForm(false); setEventEditId(null); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button>{eventEditId && <button type="button" onClick={() => { const selected = companyEvents.find((item) => item._id === eventEditId); if (selected) void removeCompanyEvent(selected); setShowEventForm(false); setEventEditId(null); }} disabled={eventSaving} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 disabled:opacity-50">Delete</button>}<button type="submit" disabled={eventSaving || !eventForm.startAt || !eventForm.endAt} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/20 disabled:opacity-50">{eventSaving ? "Saving..." : eventEditId ? "Update event" : "Save event"}</button></div>
            </form>
          </section>
        </div>}
        <div className="block">
          <section className="overflow-hidden rounded-[28px] border border-white/90 bg-white/80 shadow-[0_18px_55px_rgba(31,41,55,0.08)] backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-600">Attendance Calendar</p><h2 className="mt-1 text-xl font-bold text-slate-900">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2></div>
              <div className="flex flex-wrap items-center gap-2">
                <CalendarExportActions month={month} selectedDay={selectedDay} records={records} holidays={holidays} leaves={leaves} events={companyEvents} />
                {isAdmin && <CalendarImportActions onImport={importCalendarRows} />}
                {isAdmin && <button type="button" onClick={syncGoogleCalendar} disabled={googleSyncing} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"><RefreshCw size={14} className={googleSyncing ? "animate-spin" : ""} />{googleSyncing ? "Syncing..." : "Google Sync"}</button>}

                {isAdmin && <><button type="button" onClick={() => { setHolidayEditId(null); setHolidayForm({ name: "", dateKey: selectedDay, type: "public", description: "" }); setHolidayYear(String(month.getFullYear())); setShowHolidayModal(true); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50">Manage holidays</button><button type="button" onClick={() => { setEventEditId(null); setEventForm({ title: "", description: "", eventType: "company_event", startAt: "", endAt: "", allDay: false, location: "" }); setShowEventForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5"><CalendarDays size={15} /> Add event / meeting</button></>}
                <button type="button" aria-label="Previous month" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() - 1, 1); setMonth(next); setSelectedDay(localDateKey(next)); }} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50"><ChevronLeft size={18} /></button>
                <button type="button" onClick={() => { setMonth(new Date()); setSelectedDay(todayKey()); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Today</button>
                <button type="button" aria-label="Next month" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); setMonth(next); setSelectedDay(localDateKey(next)); }} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 border-b border-slate-100 bg-white/70 px-1 pb-2 text-center text-[9px] font-extrabold uppercase tracking-normal text-slate-400 sm:gap-2 sm:px-2 sm:pb-3 sm:text-[11px] sm:tracking-[0.16em]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className={`py-3 ${day === "Sun" ? "text-rose-600" : ""}`}>{day}</div>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1 p-1 sm:mt-2 sm:gap-2 sm:p-3">
              {calendarCells.map((cell) => {
                const dayRecords = records.filter((record) => record.dateKey === cell.key);
                const dayHoliday = holidays.filter((holiday) => holiday.dateKey === cell.key && holiday.isActive);
                const statuses = dayRecords.map((record) => record.status);
                const isToday = cell.key === currentDateKey;
                const isSunday = new Date(`${cell.key}T00:00:00`).getDay() === 0;
                const isHoliday = dayHoliday.length > 0;
                const isSelected = cell.key === selectedDay;
                return (
                  <div key={cell.key} className={`relative flex min-h-[48px] flex-col items-start rounded-lg border p-1 text-left transition-all duration-200 sm:min-h-[112px] sm:rounded-2xl sm:p-2.5 ${!cell.inMonth ? "border-transparent bg-slate-50/50 text-slate-300" : isSunday || isHoliday ? "border-rose-100 bg-rose-50/60 text-slate-700" : "border-slate-100/90 bg-white/70 text-slate-700 hover:border-indigo-200 hover:shadow-md"} ${isSelected ? "border-indigo-300 bg-indigo-50/90 shadow-[0_5px_18px_rgba(99,102,241,0.12)] ring-1 ring-indigo-200" : ""} ${!isAdmin ? "cursor-pointer" : ""}`} onMouseEnter={(event) => { if (hoverPreviewTimer.current) clearTimeout(hoverPreviewTimer.current); if (hoverPreviewHideTimer.current) clearTimeout(hoverPreviewHideTimer.current); setHoverPreviewClosing(false); setHoverPreview(null); const rect = event.currentTarget.getBoundingClientRect(); hoverPreviewTimer.current = setTimeout(() => { const width = Math.min(304, window.innerWidth - 24); const height = 224; const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)); const below = rect.bottom + 10; const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - height - 10); setHoverPreview({ day: cell.key, top, left }); }, 3000); }} onMouseLeave={() => { if (hoverPreviewTimer.current) clearTimeout(hoverPreviewTimer.current); hoverPreviewTimer.current = null; if (hoverPreview?.day === cell.key) { setHoverPreviewClosing(true); if (hoverPreviewHideTimer.current) clearTimeout(hoverPreviewHideTimer.current); hoverPreviewHideTimer.current = setTimeout(() => { setHoverPreview(null); setHoverPreviewClosing(false); }, 420); } }} onClick={() => { if (!isAdmin) openLeaveForDate(cell.key); }}>
                    <div className="flex w-full items-center justify-between"><button type="button" aria-label={`Select date ${cell.key}`} onClick={(event) => { event.stopPropagation(); if (isAdmin) setSelectedDay(cell.key); else openLeaveForDate(cell.key); }} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition hover:ring-2 hover:ring-indigo-200 sm:h-7 sm:w-7 sm:text-xs ${isToday ? (isSunday || isHoliday ? "bg-rose-600 text-white" : "bg-indigo-600 text-white") : isSunday || isHoliday ? "bg-rose-100 text-rose-700" : cell.inMonth ? "text-slate-700" : "text-slate-400"}`}>{cell.day}</button><div className="flex items-center gap-2">{dayRecords.length > 1 && <span className="text-[9px] font-semibold text-slate-400">{dayRecords.length}</span>}{dayRecords.length > 0 && <button type="button" title="View attendance details" aria-label={`View attendance details for ${cell.key}`} onClick={(event) => { event.stopPropagation(); setSelectedDay(cell.key); setShowDayDetails(true); }} className={`h-3.5 w-3.5 rounded-full ring-2 ring-white shadow-sm transition hover:scale-125 focus:outline-none focus:ring-4 focus:ring-indigo-200 ${statuses.includes("absent") ? "bg-rose-500" : statuses.includes("half-day") ? "bg-amber-500" : "bg-emerald-500"}`} />}</div></div>
                    <div className="mt-1 hidden w-full space-y-1 sm:block">
                      {companyEvents.filter((event) => event.status === "scheduled" && event.eventType === "company_event" && new Date(event.startAt) <= new Date(`${cell.key}T23:59:59.999`) && new Date(event.endAt) >= new Date(`${cell.key}T00:00:00`)).slice(0, 1).map((event) => isAdmin ? <button type="button" key={event._id} title="Edit function" aria-label={`Edit function ${event.title}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); openEventEditor(event); }} className="w-full min-w-0 truncate rounded-lg border border-violet-100 bg-violet-50 px-1.5 py-1.5 text-left text-[9px] font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 sm:text-[10px]">{event.title}</button> : <div key={event._id} title={event.title} className="w-full min-w-0 truncate rounded-lg border border-violet-100 bg-violet-50 px-1.5 py-1.5 text-[9px] font-bold text-violet-700 sm:text-[10px]">{event.title}</div>)}
                    </div>
                  </div>
                );
              })}
            </div>
            {hoverPreview && (() => {
              const previewDay = hoverPreview.day;
              const previewHoliday = holidays.filter((item) => item.dateKey === previewDay && item.isActive);
              const previewEvents = companyEvents.filter((item) => item.status === "scheduled" && new Date(item.startAt) <= new Date(`${previewDay}T23:59:59.999`) && new Date(item.endAt) >= new Date(`${previewDay}T00:00:00`));
              const previewLeaves = leaves.filter((item) => (item.status === "pending" || item.status === "approved") && item.startDate <= previewDay && item.endDate >= previewDay);
              return createPortal(<div className="pointer-events-none fixed z-[9999] w-[304px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[22px] border border-white/80 bg-white/65 p-4 text-slate-800 shadow-[0_20px_60px_rgba(71,85,105,0.20)] backdrop-blur-2xl" style={{ top: hoverPreview.top, left: hoverPreview.left, animation: hoverPreviewClosing ? "calendarPreviewOut 420ms ease-out forwards" : "calendarPreviewIn 360ms cubic-bezier(0.2,0.8,0.2,1)" }}><p className="mb-3 border-b border-white/80 pb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">{new Date(`${previewDay}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} <span className="ml-1 font-semibold text-slate-400">· DAY DETAILS</span></p><div className="max-h-40 space-y-2 overflow-y-auto">{previewHoliday.map((item) => <p key={item._id} className="truncate rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">Holiday · {item.name}</p>)}{previewEvents.map((item) => <div key={item._id} className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2"><p className="truncate text-[11px] font-bold text-violet-800">{item.title}</p><p className="mt-0.5 text-[10px] capitalize text-violet-600">{item.eventType.replace("_", " ")} · {item.allDay ? "All day" : formatTime(item.startAt)}</p></div>)}{previewLeaves.map((item) => <p key={item._id} className="truncate rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">Leave · {item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : item.leaveType}</p>)}{!previewHoliday.length && !previewEvents.length && !previewLeaves.length && <p className="py-3 text-center text-[11px] text-slate-400">No events or meetings</p>}</div></div>, document.body);
            })()}
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-violet-500" />Company events / Meetings</span>
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Present</span>
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Absent</span>
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />Half Day</span>
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" />Late</span>
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Sunday / Holiday</span>
              <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" />Weekly Off</span>
            </div>
          </section>


        </div>

        {showDayDetails && <div className="fixed inset-0 z-[85] grid place-items-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDayDetails(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-details-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.24)] sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-500">Daily attendance</p><h2 id="attendance-details-title" className="mt-1 text-2xl font-extrabold text-slate-950">Attendance Details</h2><p className="mt-1 text-sm text-slate-500">{selectedLabel}</p></div><button type="button" onClick={() => setShowDayDetails(false)} aria-label="Close attendance details" className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200"><X size={18} /></button></div>
            {selectedRecords.length ? <div className="space-y-3">{selectedRecords.map((record) => <div key={record._id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold text-slate-900">{record.employee ? `${record.employee.firstName} ${record.employee.lastName}` : "My attendance"}</p><p className="text-xs text-slate-500">{record.employee?.employeeCode || ""}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusClass[record.status]}`}>{record.status === "half-day" ? "Half day" : record.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-[10px] font-bold uppercase text-slate-400">Check-in</p><p className="mt-1 font-semibold text-slate-800">{formatTime(record.checkIn)}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Check-out</p><p className="mt-1 font-semibold text-slate-800">{formatTime(record.checkOut)}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Working time</p><p className="mt-1 font-semibold text-slate-800">{formatHours(record.workMinutes || 0)}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Flags</p><p className="mt-1 font-semibold text-slate-800">{record.isLate ? "Late" : "On time"}{record.isEarlyLeaving ? " · Early leave" : ""}</p></div></div>{record.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{record.notes}</p>}</div>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No attendance record for this date.</div>}
            {selectedHoliday.length > 0 && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><strong>Holiday:</strong> {selectedHoliday.map((holiday) => holiday.name).join(", ")}</div>}
            {selectedLeaves.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><strong>Leave:</strong> {selectedLeaves.map((leave) => `${leave.leaveType} (${leave.status})`).join(", ")}</div>}
            {selectedEvents.length > 0 && <div className="mt-3 space-y-2">{selectedEvents.map((event) => <div key={event._id} className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900"><strong>{event.title}</strong><p className="mt-1 text-xs">{event.eventType.replace("_", " ")} · {event.allDay ? "All day" : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`}{event.location ? ` · ${event.location}` : ""}</p>{event.description && <p className="mt-2 text-violet-800">{event.description}</p>}</div>)}</div>}
            <div className="mt-6 flex justify-end"><button type="button" onClick={() => setShowDayDetails(false)} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">Close</button></div>
          </section>
        </div>}
        {showLeaveModal && <div className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-slate-950/35 p-4 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLeaveModal(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-leave-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.22)] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-indigo-500">Leave request</p><h2 id="attendance-leave-title" className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Apply for leave</h2><p className="mt-1 text-sm text-slate-500">Your request will follow the existing HR approval process.</p></div><button type="button" onClick={() => setShowLeaveModal(false)} aria-label="Close leave application" className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"><X size={18} /></button></div>
            <form onSubmit={submitLeaveRequest} className="space-y-4">
              <div className="rounded-2xl bg-indigo-50/80 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo-500">Selected date</p><p className="mt-1 font-bold text-indigo-950">{new Date(`${leaveForm.startDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
              <label className="block text-sm font-bold text-slate-700">Leave type<select required value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"><option value="earned">Annual Leave</option><option value="sick">Sick Leave</option><option value="casual">Casual Leave</option><option value="unpaid">Unpaid Leave</option></select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-700">Start date<input required type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value, endDate: leaveForm.endDate < e.target.value ? e.target.value : leaveForm.endDate })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label><label className="block text-sm font-bold text-slate-700">End date<input required type="date" min={leaveForm.startDate} value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label></div>
              <label className="block text-sm font-bold text-slate-700">Reason<textarea required minLength={5} maxLength={1000} rows={4} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Please share a brief reason for your leave..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-5 sm:flex-row"><button type="button" onClick={() => setShowLeaveModal(false)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Cancel</button><button type="submit" disabled={leaveSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} />{leaveSaving ? "Submitting..." : "Submit request"}</button></div>
            </form>
          </section>
        </div>}
        <p className="mt-5 text-xs text-slate-400">Attendance timezone: Asia/Kolkata. Days without a saved attendance record are shown as “No attendance record”; they are not automatically counted as absent.</p>
      </div>
      </main>
    </>
  );
}

export default function AttendancePage() {
  return <AuthGuard><AttendanceWorkspace /></AuthGuard>;
}
