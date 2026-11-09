"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, UserCircle, BriefcaseBusiness, Clock3, ShieldCheck, Save } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type Profile = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joiningDate?: string;
  employmentStatus: string;
  department?: { name: string; code?: string } | null;
  designation?: { name: string } | null;
  shift?: { name: string; startTime?: string; endTime?: string; weeklyOffDays?: string[] } | null;
  reportingManager?: { employeeCode: string; firstName: string; lastName: string } | null;
};

type CurrentUser = { email: string; role: string; employee: Profile };
type HrDetails = {
  dateOfBirth: string;
  bankName: string;
  accountHolderName: string;
  bankAccountNumberMasked: string;
  ifscCode: string;
  panNumberMasked: string;
  pfNumberMasked: string;
  uanNumberMasked: string;
  hasBankAccountNumber: boolean;
  hasPanNumber: boolean;
  hasPfNumber: boolean;
  hasUanNumber: boolean;
};

const emptyHrDetails: HrDetails = {
  dateOfBirth: "", bankName: "", accountHolderName: "",
  bankAccountNumberMasked: "", ifscCode: "", panNumberMasked: "",
  pfNumberMasked: "", uanNumberMasked: "",
  hasBankAccountNumber: false, hasPanNumber: false,
  hasPfNumber: false, hasUanNumber: false
};

function ProfileContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [hrDetails, setHrDetails] = useState<HrDetails>(emptyHrDetails);
  const [form, setForm] = useState({
    dateOfBirth: "", bankName: "", accountHolderName: "",
    bankAccountNumber: "", ifscCode: "", panNumber: "", pfNumber: "", uanNumber: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const loadProfile = useCallback(async () => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) { router.push("/login"); return; }
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [profileResponse, detailsResponse] = await Promise.all([
        fetch(`${API_URL}/auth/me`, { headers, cache: "no-store" }),
        fetch(`${API_URL}/employee-hr-details/me`, { headers, cache: "no-store" })
      ]);
      const result = await profileResponse.json();
      if (profileResponse.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.push("/login");
        return;
      }
      if (!profileResponse.ok || !result.success || !result.data?.employee) {
        throw new Error(result.message || "Unable to load your profile");
      }
      setProfile(result.data);

      const detailsResult = await detailsResponse.json();
      if (!detailsResponse.ok || !detailsResult.success) {
        throw new Error(detailsResult.message || "Unable to load HR and payroll details");
      }
      const details = { ...emptyHrDetails, ...detailsResult.data };
      setHrDetails(details);
      setForm((current) => ({ ...current, dateOfBirth: details.dateOfBirth || "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your profile");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void Promise.resolve().then(() => loadProfile()); }, [loadProfile]);

  const date = (value?: string) => value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "-";

  const field = (label: string, value?: string | null) => (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );

  const updateForm = (name: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));

  const saveHrDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = sessionStorage.getItem("hrms_token");
    if (!token) { router.push("/login"); return; }
    setSaving(true);
    setError("");
    setSaveMessage("");
    try {
      const payload: Record<string, string> = { dateOfBirth: form.dateOfBirth };
      for (const key of ["bankName", "accountHolderName", "bankAccountNumber", "ifscCode", "panNumber", "pfNumber", "uanNumber"] as const) {
        if (form[key].trim()) payload[key] = form[key].trim();
      }
      const response = await fetch(`${API_URL}/employee-hr-details/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to save HR details");
      setHrDetails({ ...emptyHrDetails, ...result.data });
      setForm((current) => ({
        ...current, bankName: "", accountHolderName: "", bankAccountNumber: "",
        ifscCode: "", panNumber: "", pfNumber: "", uanNumber: ""
      }));
      setSaveMessage("HR and payroll details saved securely.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save HR details");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "block text-sm font-medium text-slate-700";

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 text-center text-slate-600">Loading your profile...</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Employee self-service</p><h1 className="mt-1 text-3xl font-bold text-slate-900">My Profile</h1><p className="mt-2 text-sm text-slate-500">Your personal, employment and payroll information.</p></div>
          <button type="button" onClick={loadProfile} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </header>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {saveMessage && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{saveMessage}</div>}
        {!profile ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">{error || "Profile information is unavailable."}</div>
        ) : (
          <>
            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-2xl bg-blue-50 p-4 text-blue-700"><UserCircle size={34} /></div>
                <div className="min-w-0 flex-1"><h2 className="text-2xl font-bold text-slate-900">{profile.employee.firstName} {profile.employee.lastName}</h2><p className="mt-1 text-sm text-slate-500">{profile.employee.employeeCode}</p><p className="mt-1 text-sm text-slate-600">{profile.email}</p></div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${profile.employee.employmentStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{profile.employee.employmentStatus}</span>
              </div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><UserCircle size={19} className="text-blue-600" /> Personal Information</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field("First name", profile.employee.firstName)}{field("Last name", profile.employee.lastName)}{field("Employee code", profile.employee.employeeCode)}{field("Email", profile.employee.email)}{field("Login email", profile.email)}{field("Phone", profile.employee.phone)}</div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><BriefcaseBusiness size={19} className="text-blue-600" /> Employment Information</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field("Department", profile.employee.department?.name)}{field("Designation", profile.employee.designation?.name)}{field("Joining date", date(profile.employee.joiningDate))}{field("Reporting manager", profile.employee.reportingManager ? `${profile.employee.reportingManager.firstName} ${profile.employee.reportingManager.lastName} (${profile.employee.reportingManager.employeeCode})` : "-")}{field("Employment status", profile.employee.employmentStatus)}</div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><Clock3 size={19} className="text-blue-600" /> Shift Information</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field("Assigned shift", profile.employee.shift?.name)}{field("Shift start", profile.employee.shift?.startTime)}{field("Shift end", profile.employee.shift?.endTime)}{field("Weekly off days", profile.employee.shift?.weeklyOffDays?.join(", "))}</div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-900"><ShieldCheck size={19} className="text-blue-600" /> HR & Payroll Details</h3>
              <p className="mb-5 text-sm text-slate-500">Sensitive identifiers are encrypted in the database. Saved values are masked; leave a field blank to keep its existing value.</p>
              <form onSubmit={saveHrDetails} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className={labelClass}>Date of Birth (DOB)<input type="date" value={form.dateOfBirth} onChange={(e) => updateForm("dateOfBirth", e.target.value)} className={inputClass} /></label>
                  <label className={labelClass}>Bank Name<input value={form.bankName} onChange={(e) => updateForm("bankName", e.target.value)} className={inputClass} placeholder={hrDetails.bankName || "Enter bank name"} /></label>
                  <label className={labelClass}>Account Holder Name<input value={form.accountHolderName} onChange={(e) => updateForm("accountHolderName", e.target.value)} className={inputClass} placeholder={hrDetails.accountHolderName || "Enter account holder"} /></label>
                  <label className={labelClass}>Bank Account Number<input inputMode="numeric" value={form.bankAccountNumber} onChange={(e) => updateForm("bankAccountNumber", e.target.value)} className={inputClass} placeholder={hrDetails.hasBankAccountNumber ? `Saved: ${hrDetails.bankAccountNumberMasked}` : "Enter account number"} /></label>
                  <label className={labelClass}>IFSC Code<input value={form.ifscCode} onChange={(e) => updateForm("ifscCode", e.target.value.toUpperCase())} className={inputClass} placeholder={hrDetails.ifscCode || "Enter IFSC"} /></label>
                  <label className={labelClass}>PAN Number<input value={form.panNumber} onChange={(e) => updateForm("panNumber", e.target.value.toUpperCase())} className={inputClass} placeholder={hrDetails.hasPanNumber ? `Saved: ${hrDetails.panNumberMasked}` : "Enter PAN"} /></label>
                  <label className={labelClass}>PF Number<input value={form.pfNumber} onChange={(e) => updateForm("pfNumber", e.target.value.toUpperCase())} className={inputClass} placeholder={hrDetails.hasPfNumber ? `Saved: ${hrDetails.pfNumberMasked}` : "Enter PF number"} /></label>
                  <label className={labelClass}>UAN Number<input inputMode="numeric" value={form.uanNumber} onChange={(e) => updateForm("uanNumber", e.target.value)} className={inputClass} placeholder={hrDetails.hasUanNumber ? `Saved: ${hrDetails.uanNumberMasked}` : "Enter 12-digit UAN"} /></label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">Only your account and HR/Admin can access these details. Managers cannot access this section.</p>
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"><Save size={16} /> {saving ? "Saving..." : "Save HR & Payroll Details"}</button>
                </div>
              </form>
            </section>

            <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> Your profile is linked to your authenticated account. HR/Admin can access authorized HR and payroll details; employee records and sensitive fields are protected by separate API permissions.</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return <AuthGuard><ProfileContent /></AuthGuard>;
}
