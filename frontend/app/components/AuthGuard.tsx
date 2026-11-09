
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LogIn, Clock3, X } from "lucide-react";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showAttendancePrompt, setShowAttendancePrompt] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<{ checkIn?: string | null; checkOut?: string | null; workMinutes?: number } | null>(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendancePromptLoading, setAttendancePromptLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      const token = sessionStorage.getItem("hrms_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:5000/api/auth/me",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error("Session expired");
        }

        if (!cancelled) {
          setAuthorized(true);
          if (sessionStorage.getItem("hrms_attendance_prompt") === "pending") {
            sessionStorage.setItem("hrms_attendance_prompt", "shown");
            setShowAttendancePrompt(true);
            setAttendancePromptLoading(true);
            try {
              const attendanceResponse = await fetch("http://localhost:5000/api/attendance/today", {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              });
              const attendanceResult = await attendanceResponse.json();
              if (!attendanceResponse.ok || !attendanceResult.success) {
                throw new Error(attendanceResult.message || "Unable to load today\u2019s attendance.");
              }
              if (!cancelled) setTodayAttendance(attendanceResult.data || null);
            } catch (attendanceLoadError) {
              if (!cancelled) setAttendanceError(attendanceLoadError instanceof Error ? attendanceLoadError.message : "Unable to load today\u2019s attendance.");
            } finally {
              if (!cancelled) setAttendancePromptLoading(false);
            }
          }
        }
      } catch {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleAttendanceAction = async (action: "check-in" | "check-out") => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) { router.replace("/login"); return; }
    setAttendanceBusy(true);
    setAttendanceError("");
    try {
      const response = await fetch(`http://localhost:5000/api/attendance/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Attendance action failed.");
      const refresh = await fetch("http://localhost:5000/api/attendance/today", {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const refreshed = await refresh.json();
      if (!refresh.ok || !refreshed.success) throw new Error(refreshed.message || "Attendance saved, but today\u2019s status could not be refreshed.");
      setTodayAttendance(refreshed.data || null);
    } catch (err) {
      setAttendanceError(err instanceof Error ? err.message : "Attendance action failed.");
    } finally { setAttendanceBusy(false); }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("hrms_token");
    sessionStorage.removeItem("hrms_user");
    sessionStorage.removeItem("hrms_attendance_prompt");
    router.replace("/login");
  };

  if (checking || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-medium text-slate-500">
          Verifying your session...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Logout from HRMS"
          title="Logout"
          className="group inline-flex items-center gap-2.5 rounded-full border border-slate-200/90 bg-white/95 py-2 pl-3 pr-4 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:shadow-xl hover:shadow-rose-900/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 active:translate-y-0"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-100">
            <LogOut size={16} strokeWidth={2.2} />
          </span>
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>

      {children}
      {showAttendancePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 px-4 py-6 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-prompt-title" className="w-full max-w-sm rounded-[26px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20"><Clock3 size={21} /></div>
              <button type="button" onClick={() => setShowAttendancePrompt(false)} aria-label="Close attendance prompt" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Daily attendance</p>
            <h2 id="attendance-prompt-title" className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">{todayAttendance?.checkOut ? "Your shift is complete" : todayAttendance?.checkIn ? "You are checked in" : "Ready to start your day?"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{todayAttendance?.checkOut ? "Your check-out has already been recorded for today." : todayAttendance?.checkIn ? "Your check-in is recorded. Remember to check out when your shift ends." : "Record your attendance for today using the button below."}</p>
            {(todayAttendance?.checkIn || todayAttendance?.checkOut) && <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Punch in</p><p className="mt-1 text-sm font-bold text-slate-800">{todayAttendance.checkIn ? new Date(todayAttendance.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Punch out</p><p className="mt-1 text-sm font-bold text-slate-800">{todayAttendance.checkOut ? new Date(todayAttendance.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</p></div></div>}
            {attendanceError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">{attendanceError}</p>}
            <div className="mt-5 flex gap-2">
              {!todayAttendance?.checkIn ? <button type="button" disabled={attendanceBusy || attendancePromptLoading} onClick={() => handleAttendanceAction("check-in")} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/15 disabled:opacity-50"><LogIn size={16} />{attendancePromptLoading ? "Loading..." : attendanceBusy ? "Processing..." : "Punch In"}</button> : !todayAttendance.checkOut ? <button type="button" disabled={attendanceBusy || attendancePromptLoading} onClick={() => handleAttendanceAction("check-out")} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/15 disabled:opacity-50"><LogOut size={16} />{attendancePromptLoading ? "Loading..." : attendanceBusy ? "Processing..." : "Punch Out"}</button> : <button type="button" onClick={() => setShowAttendancePrompt(false)} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Continue</button>}
              {todayAttendance?.checkIn && !todayAttendance?.checkOut && <button type="button" onClick={() => setShowAttendancePrompt(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Later</button>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
