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

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Loading Gmail integration...</main>;

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#172554,_#0b1224_48%,_#080d1c)] px-3 py-3 text-white sm:px-4 sm:py-4">
      <div className={`mx-auto ${isPopup ? "max-w-3xl" : "max-w-5xl"}`}>
        {!isPopup && <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-300 transition hover:text-white"><ArrowLeft size={14} /> Dashboard</Link>}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-indigo-300">Workspace integrations</p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-white">Google Gmail</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">Securely connect an Admin/HR Gmail account to review recent employee-related email messages.</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-300/10 text-rose-200"><Mail size={19} /></div>
        </header>

        {notice && <div role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-2 text-xs font-semibold text-emerald-100"><CheckCircle2 size={17} />{notice}</div>}
        {error && <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.08] px-3 py-2 text-xs text-rose-100"><CircleAlert size={17} />{error}</div>}

        {!isAuthorized ? (
          <section className="rounded-xl border border-amber-300/20 bg-amber-300/[.08] p-4 text-xs font-medium text-amber-100">Only Admin and HR accounts can manage the company Gmail integration.</section>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#080d1c]/80 p-4 shadow-[0_18px_55px_-25px_rgba(0,0,0,.8)] backdrop-blur-2xl sm:p-5">
              <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-5">
                <div className="flex min-w-0 items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${status?.connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {status?.connected ? <CheckCircle2 size={23} /> : <Unplug size={23} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-extrabold text-white">Connection status</h2>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${status?.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{status?.connected ? "Connected" : "Not connected"}</span>
                    </div>
                    <p className="mt-2 break-all text-xs font-semibold text-slate-200">{status?.googleEmail || "No Google account connected"}</p>
                    {status?.connected && <p className="mt-2 text-[10px] text-slate-400">Connected on {dateLabel(status.connectedAt)}</p>}
                    {status?.lastUsedAt && <p className="mt-1 text-[10px] text-slate-400">Last email read: {dateLabel(status.lastUsedAt)}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={loadStatus} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[.06] px-3 py-2 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10"><RefreshCw size={15} /> Refresh status</button>
                  <button type="button" onClick={connectGmail} disabled={connecting} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300/25 bg-indigo-400/20 px-3 py-2 text-[10px] font-bold text-indigo-50 transition hover:bg-indigo-400/30 disabled:cursor-wait disabled:opacity-60"><Mail size={16} />{connecting ? "Redirecting..." : status?.connected ? "Reconnect Google" : "Connect Google Account"}<ExternalLink size={14} /></button>
                </div>
              </div>
            </section>

            <section className="mt-3 rounded-xl border border-indigo-300/15 bg-indigo-300/[.06] p-3">
              <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-indigo-200" /><div><h3 className="text-sm font-bold text-indigo-100">Privacy and access</h3><p className="mt-1 text-sm leading-6 text-slate-300">Gmail access is read-only. OAuth tokens are encrypted in the backend. Only Admin/HR can connect the account and read message previews. This page does not automatically modify employee records.</p></div></div>
            </section>

            <section className="mt-4">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div><h2 className="text-sm font-extrabold text-white">Recent Gmail messages</h2><p className="mt-1 text-[10px] text-slate-400">Read up to 20 messages from the last 30 days and inspect employee matches.</p></div>
                <button type="button" onClick={loadMessages} disabled={!status?.connected || syncing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={15} className={syncing ? "animate-spin" : ""} />{syncing ? "Loading messages..." : "Load recent messages"}</button>
              </div>
              {!status?.connected ? <div className="rounded-xl border border-dashed border-white/15 bg-white/[.03] p-5 text-center text-xs text-slate-400">Connect a Google account to load Gmail messages.</div> : messages.length === 0 ? <div className="rounded-xl border border-white/10 bg-white/[.03] p-5 text-center text-xs text-slate-400">No messages loaded yet. Select “Load recent messages” to begin.</div> : (
                <div className="space-y-2">
                  {messages.map((message) => <article key={message.messageId} className="rounded-xl border border-white/10 bg-white/[.04] p-3 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-xs font-bold text-white">{message.subject || "(No subject)"}</h3><p className="mt-1 break-all text-xs text-slate-500">{message.from}</p></div><time className="text-xs text-slate-400">{message.date}</time></div>
                    <p className="mt-3 text-[11px] leading-5 text-slate-300">{message.snippet || "No preview available."}</p>
                    {message.matchedEmployees?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{message.matchedEmployees.map((employee) => <span key={employee.employeeCode} className="rounded-full border border-emerald-300/15 bg-emerald-300/[.08] px-2.5 py-1 text-[10px] font-semibold text-emerald-200">{employee.employeeName} · {employee.employeeCode}</span>)}</div>}
                  </article>)}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function GoogleGmailIntegrationPage() {
  return <AuthGuard><GmailIntegrationContent /></AuthGuard>;
}
