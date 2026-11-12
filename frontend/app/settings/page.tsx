"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, Check, ChevronRight, Globe2, Headset, LockKeyhole, Mail, Monitor, Moon, Plug, RefreshCw, Settings2, Sun, UserRound, X, Users } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = `${API_URL}`;
type Tab = "general" | "account" | "notifications" | "integrations" | "support" | "admin" | "hr";

function SettingsContent() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("general");
  const [role, setRole] = useState("employee");
  const [status, setStatus] = useState<{connected:boolean;googleEmail:string|null;connectedAt:string|null}|null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [appearance, setAppearance] = useState("system");
  const [dateFormat, setDateFormat] = useState("DD MMM YYYY");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [appAlerts, setAppAlerts] = useState(true);

  const token = () => sessionStorage.getItem("hrms_token") || "";
  const loadStatus = useCallback(async () => {
    const authToken = token();
    if (!authToken) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/integrations/google/gmail/status`, { headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load Google connection");
      setStatus({ connected: Boolean(result.connected), googleEmail: result.googleEmail || null, connectedAt: result.connectedAt || null });
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load Google connection"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      const currentRole = user.role || "employee";
      setRole(currentRole);
      const saved = JSON.parse(localStorage.getItem("hrms_preferences") || "{}");
      if (saved.appearance) setAppearance(saved.appearance);
      if (saved.dateFormat) setDateFormat(saved.dateFormat);
      if (typeof saved.emailAlerts === "boolean") setEmailAlerts(saved.emailAlerts);
      if (typeof saved.appAlerts === "boolean") setAppAlerts(saved.appAlerts);
    } catch {}
    if (new URLSearchParams(window.location.search).get("connected") === "1") setNotice("Google account connected successfully.");
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      if (user.role === "admin" || user.role === "hr") void loadStatus();
    } catch {}
  }, [loadStatus]);

  const savePreference = (key: string, value: string | boolean) => {
    const saved = JSON.parse(localStorage.getItem("hrms_preferences") || "{}");
    const next = { ...saved, [key]: value };
    localStorage.setItem("hrms_preferences", JSON.stringify(next));
    if (key === "appearance") setAppearance(String(value));
    if (key === "dateFormat") setDateFormat(String(value));
    if (key === "emailAlerts") setEmailAlerts(Boolean(value));
    if (key === "appAlerts") setAppAlerts(Boolean(value));
    setNotice("Preference saved on this device.");
  };

  const connect = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_URL}/integrations/google/gmail/connect`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !result.authorizationUrl) throw new Error(result.message || "Unable to start Google authorization");
      window.location.assign(result.authorizationUrl);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to connect Google"); setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect this Google account from HRMS? Gmail scanning and Google Calendar sync will stop for this account.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_URL}/integrations/google/gmail/disconnect`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to disconnect Google account");
      setStatus({ connected: false, googleEmail: null, connectedAt: null });
      setNotice("Google account disconnected from HRMS.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to disconnect Google account"); }
    finally { setBusy(false); }
  };

  const close = () => router.back();
  const isAdmin = role === "admin" || role === "hr";
  const tabs: {id:Tab;label:string;icon:typeof Settings2}[] = [
    {id:"general",label:"General",icon:Settings2},{id:"account",label:"Account",icon:UserRound},
    {id:"notifications",label:"Notifications",icon:Bell},
    ...(isAdmin ? [{id:"integrations" as Tab,label:"Integrations",icon:Plug}] : []),
    {id:"support",label:"IT Support",icon:Headset},
    ...(role === "admin" ? [{id:"admin" as Tab,label:"Admin Tools",icon:LockKeyhole}] : []),
    ...(role === "hr" ? [{id:"hr" as Tab,label:"HR Tools",icon:Users}] : [])
  ];

  return (
    <main className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/30 px-3 py-4 backdrop-blur-md sm:px-6" onMouseDown={(e)=>{if(e.target===e.currentTarget) close();}}>
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="hrms-enter flex max-h-[min(690px,92vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/95 shadow-[0_30px_100px_rgba(15,23,42,.24)] backdrop-blur-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"><Settings2 size={19}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-500">Workspace preferences</p><h1 id="settings-title" className="text-lg font-extrabold tracking-tight text-slate-900">Settings</h1></div></div>
          <button type="button" onClick={close} aria-label="Close settings" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><X size={17}/></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[190px_1fr]">
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 p-2 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
            {tabs.map(item=>{const Icon=item.icon;return <button key={item.id} type="button" onClick={()=>{setTab(item.id);setError("");setNotice("");}} className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${tab===item.id?"bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/15":"text-slate-600 hover:bg-white hover:text-indigo-700"}`}><Icon size={15}/>{item.label}</button>;})}
          </nav>
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700"><Check size={14}/>{notice}</p>}
            {error && <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</p>}
            {tab==="general" && <div className="space-y-4"><div><h2 className="text-sm font-bold text-slate-900">General preferences</h2><p className="mt-1 text-xs text-slate-500">Choose how HRMS looks and displays dates on this device.</p></div>
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-800">Appearance</p><div className="mt-3 grid grid-cols-3 gap-2">{[{id:"light",label:"Light",icon:Sun},{id:"dark",label:"Dark",icon:Moon},{id:"system",label:"System",icon:Monitor}].map(o=>{const Icon=o.icon;return <button key={o.id} onClick={()=>savePreference("appearance",o.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-semibold ${appearance===o.id?"border-indigo-300 bg-indigo-50 text-indigo-700":"border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Icon size={15}/>{o.label}</button>;})}</div></div>
              <label className="block rounded-2xl border border-slate-200 p-4"><span className="text-xs font-bold text-slate-800">Date format</span><select value={dateFormat} onChange={e=>savePreference("dateFormat",e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option>DD MMM YYYY</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>
              <p className="flex items-center gap-2 text-[10px] text-slate-400"><Globe2 size={13}/> Preferences are currently stored in this browser on this device.</p>
            </div>}
            {tab==="account" && <div className="space-y-3"><div><h2 className="text-sm font-bold text-slate-900">Account & security</h2><p className="mt-1 text-xs text-slate-500">Manage your personal account information.</p></div><div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><LockKeyhole size={17} className="text-indigo-600"/><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">Password & access</strong><small className="text-[10px] text-slate-500">{role==="admin"?"Admin can reset employee passwords from Employee Management.":role==="hr"?"For password resets, request the Admin to perform the reset.":"Contact your Admin or HR to change/reset your password."}</small></span></div></div>}
            {tab==="notifications" && <div className="space-y-3"><div><h2 className="text-sm font-bold text-slate-900">Notifications</h2><p className="mt-1 text-xs text-slate-500">Choose your local notification preferences.</p></div>{[{label:"Email notifications",desc:"Receive HRMS updates by email.",value:emailAlerts,key:"emailAlerts"},{label:"In-app notifications",desc:"Show alerts and updates inside HRMS.",value:appAlerts,key:"appAlerts"}].map(item=><div key={item.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"><span><strong className="block text-xs text-slate-800">{item.label}</strong><small className="text-[10px] text-slate-500">{item.desc}</small></span><button type="button" role="switch" aria-checked={item.value} onClick={()=>savePreference(item.key,!item.value)} className={`relative h-6 w-11 rounded-full transition ${item.value?"bg-indigo-600":"bg-slate-300"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${item.value?"left-6":"left-1"}`}/></button></div>)}</div>}
            {tab==="integrations" && <div className="space-y-4"><div><h2 className="text-sm font-bold text-slate-900">Connected services</h2><p className="mt-1 text-xs text-slate-500">Manage the Google account linked to HRMS.</p></div>{!isAdmin?<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">Only Admin and HR can manage the company Google integration.</div>:<div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Mail size={19}/></span><div><p className="text-xs font-bold text-slate-900">Google Gmail & Calendar</p><p className="mt-1 break-all text-[10px] text-slate-500">{loading?"Checking connection…":status?.connected?status.googleEmail:"Not connected"}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${status?.connected?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{status?.connected?"CONNECTED":"DISCONNECTED"}</span></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={connect} disabled={busy||loading} className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-[11px] font-bold text-white shadow-md shadow-indigo-500/15 disabled:opacity-50">{busy?"Please wait…":status?.connected?"Reconnect":"Connect Google"}</button>{status?.connected&&<button type="button" onClick={disconnect} disabled={busy} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[11px] font-bold text-rose-700 disabled:opacity-50">Disconnect</button>}<button type="button" onClick={loadStatus} disabled={loading} className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-600 hover:bg-slate-50" aria-label="Refresh status"><RefreshCw size={14} className={loading?"animate-spin":""}/></button></div><p className="mt-3 text-[10px] leading-5 text-slate-400">Gmail access is read-only. Disconnecting removes the saved Google connection from HRMS and stops Gmail scanning and Google Calendar sync for this account.</p></div>}</div>}
            {tab==="admin" && role==="admin" && <div className="space-y-3"><div><h2 className="text-sm font-bold text-slate-900">Administrator settings</h2><p className="mt-1 text-xs text-slate-500">Administrative account and employee access controls.</p></div><Link href="/employees" className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 hover:bg-indigo-50"><span><strong className="block text-xs text-slate-800">Employee account management</strong><small className="text-[10px] text-slate-500">Open employee records and reset passwords securely</small></span><ChevronRight size={16}/></Link><p className="rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500">Password reset is Admin-only. Employee self-service password reset remains disabled. Two-factor authentication will be planned as a separate security phase.</p></div>}
            {tab==="hr" && role==="hr" && <div className="space-y-3"><div><h2 className="text-sm font-bold text-slate-900">HR workspace settings</h2><p className="mt-1 text-xs text-slate-500">HR operational tools and employee support.</p></div><Link href="/employees" className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"><span><strong className="block text-xs text-slate-800">Employee directory</strong><small className="text-[10px] text-slate-500">View employee records allowed to HR</small></span><ChevronRight size={16}/></Link></div>}
            {tab==="support" && <div className="space-y-3"><div><h2 className="text-sm font-bold text-slate-900">IT Support</h2><p className="mt-1 text-xs text-slate-500">Report HRMS errors, raise support tickets and track their resolution.</p></div><Link href="/helpdesk" className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 transition hover:border-indigo-200 hover:bg-indigo-50"><span className="flex items-center gap-3"><Headset size={19} className="text-indigo-600"/><span><strong className="block text-xs text-slate-900">Open IT Support</strong><small className="text-[10px] text-slate-500">Create a ticket and follow its progress</small></span></span><ChevronRight size={16} className="text-indigo-500"/></Link></div>}
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3"><button type="button" onClick={close} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={14}/>Back to HRMS</button><span className="text-[10px] text-slate-400">HRMS Workspace Settings</span></footer>
      </section>
    </main>
  );
}

export default function SettingsPage() {
  return <AuthGuard><SettingsContent/></AuthGuard>;
}
