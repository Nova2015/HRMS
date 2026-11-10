"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Mail, RefreshCw, ShieldCheck, Unplug, LockKeyhole, Clock3, Inbox, ArrowUpRight } from "lucide-react";
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

  if (loading) return <main className="flex min-h-[420px] items-center justify-center bg-[#080d1c] text-sm text-slate-400"><RefreshCw size={16} className="mr-2 animate-spin text-violet-300" /> Checking secure Gmail connection...</main>;

  return (
    <main className="min-h-full overflow-y-auto bg-[#080d1c] px-4 py-4 text-white sm:px-6 sm:py-5">
      <div className={`mx-auto ${isPopup ? "max-w-5xl" : "max-w-6xl"}`}>
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-white/[.08] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-300/20 bg-gradient-to-br from-rose-400/20 to-orange-300/10 text-rose-200 shadow-lg shadow-rose-950/30"><Mail size={21} /></span>
            <div><p className="text-[9px] font-bold uppercase tracking-[.24em] text-rose-200/70">HRMS · Connected services</p><h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-white">Google Gmail</h1><p className="mt-0.5 text-[10px] text-slate-500">Company mailbox integration</p></div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:flex"><LockKeyhole size={11} /> Secure connection</span>
        </header>

        {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-2.5 text-[11px] font-semibold text-emerald-100"><CheckCircle2 size={15} />{notice}</div>}
        {error && <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.08] px-3 py-2.5 text-[11px] text-rose-100"><CircleAlert size={15} />{error}</div>}

        {!isAuthorized ? <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[.07] p-5 text-sm text-amber-100">Only Admin and HR accounts can manage the company Gmail integration.</section> : <>
          <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-[#17213b] via-[#111a30] to-[#21182f] p-4 shadow-[0_24px_70px_-38px_rgba(99,102,241,.55)] sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 left-1/3 h-52 w-52 rounded-full bg-rose-400/10 blur-3xl" />
            <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${status?.connected ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/[.06] text-slate-400"}`}>{status?.connected ? <CheckCircle2 size={22} /> : <Unplug size={21} />}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-white">Mailbox connection</h2><span className={`rounded-full border px-2.5 py-1 text-[9px] font-extrabold tracking-wider ${status?.connected ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/[.08] text-amber-200"}`}>{status?.connected ? "CONNECTED" : "NOT CONNECTED"}</span></div>
                  <p className="mt-1.5 break-all text-sm font-semibold text-slate-200">{status?.googleEmail || "No Google account connected"}</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">{status?.connected ? "Your company mailbox is linked and ready for read-only message review." : "Connect the approved company Google account to enable mailbox review."}</p>
                </div>
              </div>
              <div className="relative flex shrink-0 flex-wrap gap-2 md:justify-end">
                <button type="button" onClick={loadStatus} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-3.5 py-2.5 text-[10px] font-bold text-slate-200 transition hover:bg-white/10"><RefreshCw size={13} /> Refresh status</button>
                <button type="button" onClick={connectGmail} disabled={connecting} className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-gradient-to-r from-violet-500/90 to-indigo-500/90 px-4 py-2.5 text-[10px] font-extrabold text-white shadow-lg shadow-indigo-950/40 transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-50"><Mail size={13} />{connecting ? "Redirecting..." : status?.connected ? "Reconnect account" : "Connect Gmail"}<ExternalLink size={11} /></button>
              </div>
            </div>
            {status?.connected && <div className="relative mt-5 grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-2"><div className="flex items-center gap-2 text-[10px] text-slate-400"><Clock3 size={13} className="text-violet-300" /><span>Connected: <strong className="font-semibold text-slate-200">{dateLabel(status.connectedAt)}</strong></span></div><div className="flex items-center gap-2 text-[10px] text-slate-400"><RefreshCw size={12} className="text-violet-300" /><span>Last read: <strong className="font-semibold text-slate-200">{dateLabel(status.lastUsedAt)}</strong></span></div></div>}
          </section>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-2xl border border-white/[.09] bg-[#10182a] p-4">
              <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-300" /><h3 className="text-xs font-bold text-white">Access & privacy</h3></div>
              <p className="mt-2 text-[10px] leading-5 text-slate-400">Gmail access is read-only. OAuth tokens are encrypted by the backend. Only Admin and HR can manage this connection, and messages do not automatically change employee records.</p>
              <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg border border-emerald-300/15 bg-emerald-300/[.06] px-2.5 py-1.5 text-[9px] font-semibold text-emerald-200">Read-only access</span><span className="rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-1.5 text-[9px] font-semibold text-slate-300">Admin / HR only</span></div>
            </section>
            <section className="rounded-2xl border border-white/[.09] bg-[#10182a] p-4">
              <div className="flex items-center gap-2"><Inbox size={16} className="text-violet-300" /><h3 className="text-xs font-bold text-white">Mailbox overview</h3></div>
              <p className="mt-2 text-[10px] leading-5 text-slate-400">Review recent messages and identify emails that match employee records.</p>
              <div className="mt-3 flex items-end justify-between"><div><p className="text-2xl font-black tabular-nums text-white">{messages.length.toString().padStart(2, "0")}</p><p className="text-[9px] uppercase tracking-wider text-slate-500">Messages loaded</p></div><span className="mb-1 text-[9px] text-slate-500">Last 30 days · max 20</span></div>
            </section>
          </div>

          <section className="mt-4 overflow-hidden rounded-2xl border border-white/[.09] bg-[#10182a]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] px-4 py-3.5">
              <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><Inbox size={16} /></span><div><h2 className="text-xs font-bold text-white">Recent Gmail messages</h2><p className="mt-0.5 text-[9px] text-slate-500">Employee-related matches are highlighted</p></div></div>
              <button type="button" onClick={loadMessages} disabled={!status?.connected || syncing} className="inline-flex items-center gap-2 rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-[10px] font-bold text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw size={12} className={syncing ? "animate-spin" : ""} />{syncing ? "Loading..." : "Load messages"}<ArrowUpRight size={11} /></button>
            </div>
            {!status?.connected ? <div className="px-4 py-8 text-center"><Mail size={22} className="mx-auto text-slate-600" /><p className="mt-2 text-[11px] font-semibold text-slate-300">Connect Gmail to view messages</p><p className="mt-1 text-[9px] text-slate-500">Your inbox remains untouched until you connect.</p></div> : messages.length === 0 ? <div className="px-4 py-8 text-center"><Inbox size={22} className="mx-auto text-slate-600" /><p className="mt-2 text-[11px] font-semibold text-slate-300">No messages loaded yet</p><p className="mt-1 text-[9px] text-slate-500">Select “Load messages” to fetch recent email previews.</p></div> : <div className="max-h-[30vh] divide-y divide-white/[.06] overflow-y-auto">{messages.map(message => <article key={message.messageId} className="px-4 py-3 transition hover:bg-white/[.025]"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-[11px] font-bold text-slate-100">{message.subject || "(No subject)"}</h3><p className="mt-1 break-all text-[9px] text-slate-500">{message.from}</p></div><time className="text-[9px] text-slate-500">{message.date}</time></div><p className="mt-2 text-[10px] leading-4 text-slate-400">{message.snippet || "No preview available."}</p>{message.matchedEmployees?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.matchedEmployees.map(employee => <span key={employee.employeeCode} className="rounded-full border border-emerald-300/15 bg-emerald-300/[.07] px-2 py-0.5 text-[9px] font-semibold text-emerald-200">{employee.employeeName} · {employee.employeeCode}</span>)}</div>}</article>)}</div>}
          </section>
        </>}
      </div>
    </main>
  );
}

export default function GoogleGmailIntegrationPage() {
  return <AuthGuard showLogout={false}><GmailIntegrationContent /></AuthGuard>;
}
