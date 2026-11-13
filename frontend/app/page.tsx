"use client";


import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  Clock3, CalendarDays, Wallet, ArrowUpRight, ShieldCheck, Activity, BarChart3, CheckCircle2, ChevronRight,
  LayoutDashboard, Crown, MapPin, Mail, Sparkles, Target, Award, Rocket,
} from "lucide-react";
import AuthGuard from "./components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type DashboardEmployee = {
  employeeCode: string;
  profilePhoto?: string;
  firstName: string;
  lastName: string;
  joiningDate?: string;
  employmentStatus: string;
  department?: { name: string } | null;
  designation?: { name: string } | null;
  shift?: { name: string; startTime?: string; endTime?: string } | null;
  reportingManager?: { firstName: string; lastName: string; employeeCode?: string } | null;
};

type DashboardAttendance = {
  _id: string;
  dateKey: string;
  checkIn: string | null;
  checkOut: string | null;
  status: "present" | "half-day" | "absent";
  isLate: boolean;
  employee?: { firstName: string; lastName: string; employeeCode: string };
  createdAt?: string;
  updatedAt?: string;
};

export default function Home() {
  const [role, setRole] = useState("employee");
  const [attendanceRecords, setAttendanceRecords] = useState<DashboardAttendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [employeeProfile, setEmployeeProfile] = useState<DashboardEmployee | null>(null);
  const [employeeProfileLoading, setEmployeeProfileLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string; employeeCode?: string; role?: string } | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("hrms_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        const nextRole = user.role || "employee";
        void Promise.resolve().then(() => {
          setRole(nextRole);
          setUserInfo(user);
        });
      } catch {
        void Promise.resolve().then(() => setRole("employee"));
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEmployeeProfile = async () => {
      setEmployeeProfileLoading(true);
      try {
        const token = sessionStorage.getItem("hrms_token");
        if (!token) return;
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        const result = await response.json();
        if (response.status === 401) {
          sessionStorage.removeItem("hrms_token");
          sessionStorage.removeItem("hrms_user");
          window.location.href = "/login";
          return;
        }
        if (!response.ok || !result.success || !result.data?.employee) throw new Error(result.message || "Unable to load employee information");
        if (!cancelled) setEmployeeProfile(result.data.employee);
      } catch (error) {
        console.error("Employee dashboard profile load failed:", error);
        if (!cancelled) setEmployeeProfile(null);
      } finally {
        if (!cancelled) setEmployeeProfileLoading(false);
      }
    };
    void loadEmployeeProfile();
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (role !== "admin" && role !== "hr") return;
    const loadDashboardAttendance = async () => {
      setAttendanceLoading(true);
      setAttendanceError("");
      try {
        const token = sessionStorage.getItem("hrms_token");
        if (!token) return;
        const now = new Date();
        const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
        const response = await fetch(`${API_URL}/attendance?from=${from}&to=${to}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (response.status === 401) {
          sessionStorage.removeItem("hrms_token");
          sessionStorage.removeItem("hrms_user");
          window.location.href = "/login";
          return;
        }
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to load attendance dashboard");
        setAttendanceRecords(Array.isArray(result.data) ? result.data : []);
      } catch (error) {
        setAttendanceError(error instanceof Error ? error.message : "Unable to load attendance dashboard");
      } finally {
        setAttendanceLoading(false);
      }
    };
    void loadDashboardAttendance();
  }, [role]);


  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) { setPhotoError("Choose a JPG, PNG or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoError("Choose an image smaller than 8 MB."); return; }
    setPhotoSaving(true);
    setPhotoError("");
    try {
      const image = new Image();
      const source = URL.createObjectURL(file);
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Unable to read this image."));
          image.src = source;
        });
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image processing is unavailable in this browser.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const profilePhoto = canvas.toDataURL("image/jpeg", 0.78);
        if (profilePhoto.length > 820000) throw new Error("Image is too large. Please choose a smaller photo.");
        const token = sessionStorage.getItem("hrms_token");
        if (!token) throw new Error("Please sign in again.");
        const response = await fetch(`${API_URL}/auth/me/photo`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ profilePhoto })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to save profile photo.");
        setEmployeeProfile((current) => current ? { ...current, profilePhoto: result.data.profilePhoto } : current);
      } finally {
        URL.revokeObjectURL(source);
      }
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to update profile photo.");
    } finally {
      setPhotoSaving(false);
    }
  };

  const isAdmin = role === "admin" || role === "hr";
  return (
    <AuthGuard>

      <section className="hrms-command-center relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 xl:px-12">
        <div className="hrms-command-orb hrms-command-orb-one" />
        <div className="hrms-command-orb hrms-command-orb-two" />
        <div className="hrms-command-orb hrms-command-orb-three" />
        <div className="relative z-10 mx-auto max-w-[1500px]">
          <header className="mb-8 flex items-center justify-between gap-6">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-slate-500">PROTOVERGE LLP</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Company Command Center</h1>
              <p className="mt-1 text-sm text-slate-500">A clear view of people, progress and what comes next.</p>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
            <article className="hrms-command-card hrms-command-profile flex min-h-0 flex-col p-5 sm:p-7 lg:col-span-4 lg:row-span-2 lg:min-h-[590px]">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">Executive status</span>
                <span className="rounded-2xl bg-violet-50 p-3 text-violet-600"><Crown size={20} /></span>
              </div>
              <div className="mt-9 flex flex-wrap items-end gap-4">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[30px] bg-gradient-to-br from-cyan-100 via-violet-100 to-orange-100 text-4xl font-black text-slate-700 shadow-inner">
                  {employeeProfile?.profilePhoto ? <img src={employeeProfile.profilePhoto} alt="Your profile" className="h-full w-full object-cover" /> : (userInfo?.name || "P").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P"}
                </div>
                <div className="pb-1">
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleProfilePhotoChange} />
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoSaving} className="rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:opacity-60">{photoSaving ? "Uploading…" : employeeProfile?.profilePhoto ? "Change photo" : "Add photo"}</button>
                  <p className="mt-1.5 text-[10px] text-slate-400">JPG, PNG or WebP · max 8 MB</p>
                </div>
              </div>
              {photoError && <p role="alert" className="mt-2 text-xs text-rose-600">{photoError}</p>}
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">{userInfo?.name || "Welcome"}</h2>
              <p className="mt-2 text-sm font-semibold text-violet-700">{role === "admin" ? "Administrator" : role === "hr" ? "HR Manager" : role === "manager" ? (userInfo?.name?.trim().toLowerCase() === "keshav" ? "Founder" : "Manager") : role === "founder" ? "Founder" : role === "co-founder" ? "Co-Founder" : "Team Member"}</p>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-600">Building thoughtful products, enabling teams and driving the next chapter of Protoverge LLP through technology and execution.</p>
              <div className="mt-8 space-y-4 border-t border-slate-100 pt-6">
                <div className="flex items-center gap-3 text-sm text-slate-600"><MapPin size={17} className="text-violet-500" /><span>Pune, India</span></div>
                <div className="flex min-w-0 items-center gap-3 text-sm text-slate-600"><Mail size={17} className="shrink-0 text-violet-500" /><span className="truncate">{userInfo?.email || "Work contact"}</span></div>
                {userInfo?.employeeCode && <div className="flex items-center gap-3 text-sm text-slate-600"><ShieldCheck size={17} className="text-violet-500" /><span>{userInfo.employeeCode}</span></div>}
              </div>
              <div className="mt-auto pt-8">
                <Link href="/profile" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-violet-700">Connect <ArrowUpRight size={16} /></Link>
              </div>
            </article>

            <article className="hrms-command-card flex min-h-[245px] flex-col justify-between p-5 sm:p-7 lg:col-span-8">
              <div className="flex items-center justify-between">
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-700">Direction & purpose</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Company Vision</h2></div>
                <span className="rounded-2xl bg-cyan-50 p-3 text-cyan-700"><Target size={22} /></span>
              </div>
              <p className="max-w-3xl text-[15px] leading-8 text-slate-600">Our mission is to create category-defining AI and technology products that solve meaningful problems at global scale. Our audacious north star: build a trillion-dollar technology company through relentless innovation, customer trust and extraordinary execution.</p>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><Sparkles size={14} className="text-cyan-600" /> Think Bigger · Build Better · Scale Globally</div>
            </article>

            <article className="hrms-command-card min-h-[250px] p-5 sm:p-7 lg:col-span-4 lg:min-h-[270px]">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-violet-700">Building the Future</p><h2 className="mt-2 text-xl font-extrabold text-slate-900">Foundations in Motion</h2></div><Award size={21} className="text-violet-600" /></div>
              <div className="mt-7 space-y-5">
                <div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-50" /><div><p className="text-sm font-bold text-slate-800">AI-Powered Business Platforms</p><p className="mt-1 text-xs leading-5 text-slate-500">Creating intelligent products that simplify complex work and unlock new possibilities for businesses.</p></div></div>
                <div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500 ring-4 ring-cyan-50" /><div><p className="text-sm font-bold text-slate-800">Predictive AI & Automation</p><p className="mt-1 text-xs leading-5 text-slate-500">Turning data into foresight, decisions and measurable business outcomes.</p></div></div>
              </div>
            </article>

            <article className="hrms-command-card min-h-[250px] p-5 sm:p-7 lg:col-span-4 lg:min-h-[270px]">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-700">The Next Challenges</p><h2 className="mt-2 text-xl font-extrabold text-slate-900">Mission: Global Scale</h2></div><Rocket size={21} className="text-orange-600" /></div>
              <div className="mt-7 space-y-5">
                <div className="flex gap-3"><span className="rounded-xl bg-orange-50 px-2.5 py-1 text-[10px] font-extrabold text-orange-700">Q1 2027</span><div><p className="text-sm font-bold text-slate-800">Product–Market Fit & Scale</p><p className="mt-1 text-xs leading-5 text-slate-500">Build products customers love, prove repeatable growth and deliver enterprise-grade reliability.</p></div></div>
                <div className="flex gap-3"><span className="rounded-xl bg-violet-50 px-2.5 py-1 text-[10px] font-extrabold text-violet-700">Q2 2027</span><div><p className="text-sm font-bold text-slate-800">Global Market Entry</p><p className="mt-1 text-xs leading-5 text-slate-500">Expand into strategic markets with secure, scalable products and a world-class team.</p></div></div>
              </div>
            </article>
          </div>
        </div>
        <style jsx global>{`
          .hrms-command-center { position: relative; isolation: isolate; background: linear-gradient(135deg,#f8fbff 0%,#f7f5ff 48%,#fffaf5 100%); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
          .hrms-command-orb { position:absolute; z-index:-1; border-radius:9999px; filter:blur(2px); pointer-events:none; animation:hrms-orb-float 14s ease-in-out infinite alternate; }
          .hrms-command-orb-one { width:380px;height:380px;top:-150px;right:8%;background:radial-gradient(circle,rgba(34,211,238,.17),transparent 68%); }
          .hrms-command-orb-two { width:420px;height:420px;bottom:-180px;left:12%;background:radial-gradient(circle,rgba(139,92,246,.15),transparent 68%);animation-delay:-5s; }
          .hrms-command-orb-three { width:300px;height:300px;top:36%;right:30%;background:radial-gradient(circle,rgba(251,146,60,.10),transparent 68%);animation-delay:-9s; }
          .hrms-command-card { position:relative; overflow:hidden; border:1px solid rgba(255,255,255,.9); border-radius:28px; background:rgba(255,255,255,.76); box-shadow:0 18px 55px rgba(31,41,55,.055),inset 0 1px 0 rgba(255,255,255,.95); backdrop-filter:blur(22px); transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease; }
          .hrms-command-card:before { content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,.55),transparent 42%);opacity:.8; }
          .hrms-command-card:hover { transform:translateY(-5px);border-color:rgba(196,181,253,.75);box-shadow:0 25px 65px rgba(31,41,55,.10); }
          .hrms-command-card > * { position:relative; z-index:1; }
          @keyframes hrms-orb-float { from { transform:translate3d(0,0,0) scale(1); } to { transform:translate3d(18px,-20px,0) scale(1.08); } }
          @media (prefers-reduced-motion:reduce) { .hrms-command-orb,.hrms-command-card { animation:none;transition:none; } }
        `}</style>
      </section>
      <main className="hidden">
        <div className="mx-auto max-w-[1440px]">
          <section className={`relative mb-6 overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white shadow-xl shadow-indigo-950/10 sm:px-8 sm:py-7 xl:min-h-[250px] ${role === "employee" ? "hrms-employee-hero" : ""}`}>
            <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[40px] border-white/5" />
            <div className="pointer-events-none absolute right-24 top-16 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
            {role === "employee" ? (
              <div className="hrms-employee-hero-content relative z-10 max-w-2xl">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1 w-7 rounded-full bg-gradient-to-r from-sky-300 to-blue-500 shadow-[0_0_14px_rgba(96,165,250,0.55)]" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-200">Employee profile</p>
                </div>
                <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                  {employeeProfileLoading ? "Loading your profile…" : employeeProfile ? `${employeeProfile.firstName} ${employeeProfile.lastName}` : "Your employee information"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-blue-100">{employeeProfile?.designation?.name || "Designation not assigned"}{employeeProfile?.department?.name ? ` · ${employeeProfile.department.name}` : ""}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize tracking-wide ${employeeProfile?.employmentStatus === "active" ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : "border-white/15 bg-white/10 text-slate-200"}`}>{employeeProfileLoading ? "Loading" : employeeProfile?.employmentStatus || "Profile unavailable"}</span>
                </div>
                {employeeProfile ? (
                  <div className="mt-5 max-w-xl border-l-2 border-blue-300/40 pl-4">
                    <div className="grid max-w-xl gap-y-2">
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Employee ID</span><span className="ml-2 font-semibold text-white">{employeeProfile.employeeCode}</span></p>
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Department</span><span className="ml-2 font-semibold text-white">{employeeProfile.department?.name || "Not assigned"}</span></p>
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Joining date</span><span className="ml-2 font-semibold text-white">{employeeProfile.joiningDate ? new Date(employeeProfile.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span></p>
                      <p className="text-xs text-slate-300"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reporting manager</span><span className="ml-2 font-semibold text-white">{employeeProfile.reportingManager ? `${employeeProfile.reportingManager.firstName} ${employeeProfile.reportingManager.lastName}` : "Not assigned"}</span></p>
                    </div>
                  </div>
                ) : !employeeProfileLoading ? (
                  <p className="mt-4 text-sm text-slate-300">Employee details could not be loaded. Open your profile to review your information.</p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Link href="/profile" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-50">View full profile <ArrowUpRight size={15} /></Link>
                  {employeeProfile?.shift?.name && <span className="text-[11px] text-slate-300">Shift: <strong className="text-white">{employeeProfile.shift.name}{employeeProfile.shift.startTime && employeeProfile.shift.endTime ? ` · ${employeeProfile.shift.startTime}–${employeeProfile.shift.endTime}` : ""}</strong></span>}
                </div>
              </div>
            ) : (
              <>
                <div className="relative z-10 max-w-2xl xl:max-w-[calc(100%-430px)]">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">PROTOVERGE LLP</span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">{isAdmin ? (role === "admin" ? "Administrator" : "HR Manager") : "Employee"}</span>
                  </div>
                  <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                    Welcome, {userInfo?.name || (role === "admin" ? "Administrator" : "HR Manager")}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-blue-100">{isAdmin ? "Company people operations workspace" : "Your team, in one place."}</p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
                    {userInfo?.employeeCode && <span><span className="text-slate-400">Employee ID</span><strong className="ml-2 text-white">{userInfo.employeeCode}</strong></span>}
                    {userInfo?.email && <span><span className="text-slate-400">Work email</span><strong className="ml-2 text-white">{userInfo.email}</strong></span>}
                    <span><span className="text-slate-400">Workspace</span><strong className="ml-2 text-white">PROTOVERGE LLP</strong></span>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={isAdmin ? "/employees" : "/leaves"} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-blue-50">{isAdmin ? "View employees" : "Review team leaves"} <ArrowUpRight size={16} /></Link>
                    <Link href="/attendance" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15">{isAdmin ? "Open attendance register" : "My attendance"} <ChevronRight size={16} /></Link>
                  </div>
                </div>
                <div className="relative z-10 mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/15 pt-5 xl:absolute xl:bottom-8 xl:right-9 xl:mt-0 xl:w-[390px] xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
                  <div><p className="text-xs text-slate-400">Reporting period</p><p className="mt-1 text-sm font-semibold">{new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p></div>
                  <div><p className="text-xs text-slate-400">Workspace</p><p className="mt-1 text-sm font-semibold">Centralized</p></div>
                  <div><p className="text-xs text-slate-400">Access</p><p className="mt-1 text-sm font-semibold">Role-based</p></div>
                </div>
              </>
            )}
          </section>

          {isAdmin && (
            <section className="mb-6">
              <div className="mb-3">
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Workspace overview</h2>
                <p className="mt-1 text-sm text-slate-500">A quick snapshot of your company attendance activity.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance entries</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{attendanceLoading ? "…" : attendanceRecords.length}</p><p className="mt-1 text-xs text-slate-500">Recorded this month</p></div>
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employees recorded</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{attendanceLoading ? "…" : new Set(attendanceRecords.map((item) => item.employee?.employeeCode).filter(Boolean)).size}</p><p className="mt-1 text-xs text-slate-500">Unique employees this month</p></div>
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Present today</p><p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">{attendanceLoading ? "…" : attendanceRecords.filter((item) => item.dateKey === new Date().toLocaleDateString("en-CA") && item.status === "present").length}</p><p className="mt-1 text-xs text-slate-500">Today's recorded presence</p></div>
                <div className="hrms-premium-card rounded-2xl p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late arrivals</p><p className="mt-2 text-2xl font-bold tabular-nums text-orange-700">{attendanceLoading ? "…" : attendanceRecords.filter((item) => item.isLate).length}</p><p className="mt-1 text-xs text-slate-500">Recorded this month</p></div>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="mb-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  
                  <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Attendance dashboard</h2>
                  <p className="mt-1 text-sm text-slate-500">Company attendance recorded from the start of this month to today.</p>
                </div>
                <Link href="/attendance" className="text-sm font-semibold text-blue-700 hover:text-blue-900">Open attendance register →</Link>
              </div>
              {attendanceError && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{attendanceError}</p>}
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Present records", value: attendanceRecords.filter((item) => item.status === "present").length, icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50" },
                  { label: "Half-day records", value: attendanceRecords.filter((item) => item.status === "half-day").length, icon: Clock3, color: "text-amber-700 bg-amber-50" },
                  { label: "Absent records", value: attendanceRecords.filter((item) => item.status === "absent").length, icon: Activity, color: "text-rose-700 bg-rose-50" },
                  { label: "Late arrivals", value: attendanceRecords.filter((item) => item.isLate).length, icon: Clock3, color: "text-orange-700 bg-orange-50" },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return <div key={stat.label} className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-4">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{stat.label}</span><span className={`rounded-lg p-2 ${stat.color}`}><Icon size={18} /></span></div>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{attendanceLoading ? "…" : stat.value}</p>
                  </div>;
                })}
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-5">
                  <div className="mb-5 flex items-center gap-2"><BarChart3 size={19} className="text-blue-700" /><h3 className="font-bold text-slate-900">Attendance trend · Last 7 days</h3></div>
                  <div className="flex h-44 items-end justify-around gap-3 border-b border-slate-100 pb-2">
                    {Array.from({ length: 7 }, (_, index) => {
                      const day = new Date();
                      day.setDate(day.getDate() - (6 - index));
                      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      const count = attendanceRecords.filter((record) => record.dateKey === key && record.status !== "absent").length;
                      const max = Math.max(1, ...Array.from({ length: 7 }, (_, offset) => {
                        const d = new Date(); d.setDate(d.getDate() - (6 - offset));
                        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        return attendanceRecords.filter((record) => record.dateKey === k && record.status !== "absent").length;
                      }));
                      return <div key={key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                        <span className="text-xs font-semibold text-slate-600">{count}</span>
                        <div className="w-full max-w-10 rounded-t-lg bg-blue-600 transition-all" style={{ height: `${Math.max(5, (count / max) * 112)}px` }} />
                        <span className="text-[11px] text-slate-500">{day.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                      </div>;
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">Counts include present and half-day records for each date.</p>
                </div>
                <div className="hrms-premium-card hrms-dashboard-3d-card rounded-2xl p-5">
                  <div className="mb-4 flex items-center gap-2"><Activity size={19} className="text-blue-700" /><h3 className="font-bold text-slate-900">Recent Activity</h3></div>
                  {attendanceLoading ? <p className="py-6 text-sm text-slate-500">Loading recent activity…</p> : attendanceRecords.length === 0 ? <p className="py-6 text-sm text-slate-500">No attendance records found for this month yet.</p> : (
                    <div className="space-y-3">
                      {[...attendanceRecords].sort((a, b) => new Date(b.updatedAt || b.createdAt || b.dateKey).getTime() - new Date(a.updatedAt || a.createdAt || a.dateKey).getTime()).slice(0, 6).map((record) => (
                        <div key={record._id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{record.employee ? `${record.employee.firstName} ${record.employee.lastName}` : "Employee"}</p><p className="text-xs text-slate-500">{record.employee?.employeeCode || "—"} · {record.dateKey}</p></div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${record.status === "present" ? "bg-emerald-50 text-emerald-700" : record.status === "half-day" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{record.status.replace("-", " ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/80 py-4 text-[10px] font-medium text-slate-400">
            <span>HRMS</span>
            
          </footer>
        </div>
      </main>
    </AuthGuard>
  );
}
