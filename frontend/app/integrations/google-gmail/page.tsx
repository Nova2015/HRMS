"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import AuthGuard from "../../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

type GmailStatus = {
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
};

type GmailMessage = {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  matchedEmployees: { employeeCode: string; employeeName: string; matchType: string }[];
};

function GmailIntegrationContent() {
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPopup, setIsPopup] = useState(false);

  const token = () => sessionStorage.getItem("hrms_token") || "";

  const loadStatus = useCallback(async () => {
    const authToken = token();
    if (!authToken) { setError("Your session has expired. Please sign in again."); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/integrations/google/gmail/status`, {
        headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load Gmail connection status");
      setStatus({
        connected: Boolean(result.connected),
        googleEmail: result.googleEmail || null,
        connectedAt: result.connectedAt || null,
        lastUsedAt: result.lastUsedAt || null
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Gmail connection status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsPopup(new URLSearchParams(window.location.search).get("popup") === "1");
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
    } catch { setRole("employee"); }
    if (new URLSearchParams(window.location.search).get("connected") === "1") setNotice("Gmail account connected successfully.");
    void loadStatus();
  }, [loadStatus]);

  const connectGmail = async () => {
    const authToken = token();
    if (!authToken) { setError("Your session has expired. Please sign in again."); return; }
    setConnecting(true); setError("");
    try {
      const response = await fetch(`${API_URL}/integrations/google/gmail/connect`, {
        headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.authorizationUrl) throw new Error(result.message || "Unable to start Google authorization");
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect Gmail");
      setConnecting(false);
    }
  };

  const loadMessages = async () => {
    const authToken = token();
    if (!authToken) { setError("Your session has expired. Please sign in again."); return; }
    setSyncing(true); setError("");
    try {
      const response = await fetch(`${API_URL}/integrations/google/gmail/messages?maxResults=20`, {
        headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to read Gmail messages");
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setNotice(`Loaded ${result.totalReturned || 0} recent messages from ${result.googleEmail || "the connected Gmail account"}.`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read Gmail messages");
    } finally { setSyncing(false); }
  };

  const isAuthorized = role === "admin" || role === "hr";
  const dateLabel = (value: string | null) => value
    ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "Not available";

  if (loading) return <main className="flex min-h-[320px] items-center justify-center bg-[#080d1c] text-xs text-slate-400"><RefreshCw size={15} className="mr-2 animate-spin" /> Loading Gmail integration...</main>;

  return (
    <main className="min-h-full bg-[radial-gradient(ellipse_at_top,_rgba(79,70,229,.18),transparent_42%),linear-gradient(145deg,#0b1224,#080d1c)] px-3 py-3 text-white sm:px-4 sm:py-4">
      <div className={`mx-auto ${isPopup ? "max-w-3xl" : "max-w-5xl"}`}>
        {!isPopup && <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white"><ArrowLeft size={14} /> Dashboard</Link>}
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[.2em] text-indigo-300">Workspace integrations</p><h1 className="mt-1 text-xl font-black tracking-tight text-white">Google Gmail</h1><p className="mt-1 text-[11px] leading-5 text-slate-400">Connect a company Gmail account to review employee-related messages.</p></div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-300/10 text-rose-200"><Mail size={18} /></span>
        </header>

        {notice && <div role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-2 text-[11px] font-semibold text-emerald-100"><CheckCircle2 size={15} />{notice}</div>}
        {error && <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.08] px-3 py-2 text-[11px] text-rose-100"><CircleAlert size={15} />{error}</div>}

        {!isAuthorized ? <section className="rounded-xl border border-amber-300/20 bg-amber-300/[.07] p-3 text-xs text-amber-100">Only Admin and HR accounts can manage the company Gmail integration.</section> : <>
          <section className="rounded-2xl border border-white/10 bg-white/[.045] p-4 shadow-[0_16px_45px_-25px_rgba(0,0,0,.8)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${status?.connected ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>{status?.connected ? <CheckCircle2 size={19} /> : <Unplug size={19} />}</span>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-white">Connection status</h2><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${status?.connected ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>{status?.connected ? "CONNECTED" : "NOT CONNECTED"}</span></div><p className="mt-1 break-all text-[11px] text-slate-300">{status?.googleEmail || "No Google account connected"}</p>{status?.connected && <p className="mt-1 text-[9px] text-slate-500">Connected {dateLabel(status.connectedAt)}{status.lastUsedAt ? ` · Last read ${dateLabel(status.lastUsedAt)}` : ""}</p>}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={loadStatus} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.05] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"><RefreshCw size={12} /> Refresh</button>
                <button type="button" onClick={connectGmail} disabled={connecting} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300/25 bg-indigo-400/15 px-3 py-1.5 text-[10px] font-bold text-indigo-100 transition hover:bg-indigo-400/25 disabled:opacity-50"><Mail size={12} />{connecting ? "Redirecting..." : status?.connected ? "Reconnect" : "Connect Google"}<ExternalLink size={11} /></button>
              </div>
            </div>
          </section>

          <section className="mt-3 flex items-start gap-2.5 rounded-xl border border-indigo-300/15 bg-indigo-300/[.055] p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-200" /><div><h3 className="text-[11px] font-bold text-indigo-100">Privacy and access</h3><p className="mt-1 text-[10px] leading-4 text-slate-400">Read-only Gmail access. OAuth tokens are encrypted in the backend. Only Admin/HR can manage this integration; employee records are not modified automatically.</p></div></section>

          <section className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">Recent Gmail messages</h2><p className="mt-0.5 text-[10px] text-slate-500">Up to 20 messages from the last 30 days.</p></div><button type="button" onClick={loadMessages} disabled={!status?.connected || syncing} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.05] px-3 py-1.5 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw size={12} className={syncing ? "animate-spin" : ""} />{syncing ? "Loading..." : "Load messages"}</button></div>
            {!status?.connected ? <div className="rounded-xl border border-dashed border-white/10 bg-white/[.025] p-5 text-center text-[10px] text-slate-500">Connect Google to view recent messages.</div> : messages.length === 0 ? <div className="rounded-xl border border-white/10 bg-white/[.025] p-5 text-center text-[10px] text-slate-500">No messages loaded. Select Load messages to begin.</div> : <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1">{messages.map(message => <article key={message.messageId} className="rounded-xl border border-white/[.08] bg-white/[.035] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-[11px] font-bold text-slate-100">{message.subject || "(No subject)"}</h3><p className="mt-1 break-all text-[9px] text-slate-500">{message.from}</p></div><time className="text-[9px] text-slate-500">{message.date}</time></div><p className="mt-2 text-[10px] leading-4 text-slate-400">{message.snippet || "No preview available."}</p>{message.matchedEmployees?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.matchedEmployees.map(employee => <span key={employee.employeeCode} className="rounded-full border border-emerald-300/15 bg-emerald-300/[.07] px-2 py-0.5 text-[9px] font-semibold text-emerald-200">{employee.employeeName} · {employee.employeeCode}</span>)}</div>}</article>)}</div>}
          </section>
        </>}
      </div>
    </main>
  );
}

export default function GoogleGmailIntegrationPage() {
  return <AuthGuard><GmailIntegrationContent /></AuthGuard>;
}
