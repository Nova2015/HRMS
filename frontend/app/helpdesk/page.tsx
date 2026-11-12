"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Headset, LoaderCircle,
  MessageSquareText, Plus, RefreshCw, Search, ShieldCheck, Ticket,
  UserRound, X, XCircle, Wrench
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = `${API_URL}`;
const categories = [
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "ui_error", label: "HRMS UI Error" },
  { value: "network", label: "Network / Internet" },
  { value: "access", label: "Account / Access" },
  { value: "other", label: "Other" },
] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
type Category = (typeof categories)[number]["value"];
type Priority = (typeof priorities)[number];
type Status = "open" | "in_progress" | "resolved" | "closed";
type Employee = { _id: string; employeeCode?: string; firstName: string; lastName: string };
type Assignee = { _id: string; email: string; role: "admin" | "hr"; employee: Employee };
type TicketItem = {
  _id: string;
  ticketNumber: string;
  createdBy: Employee | string;
  category: Category;
  priority: Priority;
  subject: string;
  description: string;
  status: Status;
  assignedTo: Assignee | null;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
};
type Workspace = {
  tickets: TicketItem[];
  assignees: Assignee[];
  summary: { total: number; open: number; inProgress: number; resolved: number; closed: number };
};

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10";
const labelClass = "block text-sm font-semibold text-slate-700";

function employeeName(value: Employee | string | null | undefined) {
  if (!value || typeof value === "string") return "Employee";
  return `${value.firstName} ${value.lastName}`;
}
function statusStyle(status: Status) {
  return status === "open" ? "bg-amber-50 text-amber-700 border-amber-100"
    : status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-100"
      : status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : "bg-slate-100 text-slate-600 border-slate-200";
}
function priorityStyle(priority: Priority) {
  return priority === "urgent" ? "bg-rose-50 text-rose-700"
    : priority === "high" ? "bg-orange-50 text-orange-700"
      : priority === "medium" ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
}
function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function HelpdeskContent() {
  const searchParams = useSearchParams();
  const [role, setRole] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [category, setCategory] = useState<Category>("software");
  const [priority, setPriority] = useState<Priority>("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const isAdmin = role === "admin" || role === "hr";
  const token = () => sessionStorage.getItem("hrms_token") || "";

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "employee");
      const result = await apiRequest("/helpdesk");
      setWorkspace(result.data as Workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Helpdesk");
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (searchParams.get("category") === "ui_error") {
      setCategory("ui_error");
      if (searchParams.get("new") === "1") setShowForm(true);
    }
  }, [searchParams]);

  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (workspace?.tickets || []).filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesQuery = !query || [
        item.ticketNumber, item.subject, item.description, item.category,
        employeeName(item.createdBy), item.assignedTo?.email || ""
      ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [workspace, search, statusFilter]);

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest("/helpdesk/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, priority, subject, description }),
      });
      setMessage(result.message);
      setShowForm(false);
      setSubject(""); setDescription(""); setCategory("software"); setPriority("medium");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit ticket");
    } finally { setBusy(false); }
  };

  const assignTicket = async (id: string, assignedTo: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/helpdesk/tickets/${id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: assignedTo || null }),
      });
      setMessage(result.message);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign ticket");
    } finally { setBusy(false); }
  };

  const updateStatus = async (ticket: TicketItem, status: Status) => {
    let resolutionNote = "";
    if (status === "resolved") {
      resolutionNote = window.prompt("Resolution note (optional):", ticket.resolutionNote || "") || "";
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/helpdesk/tickets/${ticket._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolutionNote }),
      });
      setMessage(result.message);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update ticket");
    } finally { setBusy(false); }
  };

  const summary = workspace?.summary;
  const stats = [
    { label: "Total Tickets", value: summary?.total || 0, icon: Ticket, tone: "bg-indigo-50 text-indigo-700", note: "All submitted requests" },
    { label: "Open", value: summary?.open || 0, icon: Clock3, tone: "bg-amber-50 text-amber-700", note: "Awaiting action" },
    { label: "In Progress", value: summary?.inProgress || 0, icon: Wrench, tone: "bg-blue-50 text-blue-700", note: "Currently being handled" },
    { label: "Resolved", value: summary?.resolved || 0, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700", note: `${summary?.closed || 0} closed` },
  ];

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-indigo-700"><ArrowLeft size={16} />Dashboard <span className="text-slate-300">/</span> IT Helpdesk &amp; Support</Link>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-3 text-white shadow-lg shadow-indigo-600/20"><Headset size={25} /></div>
              <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">IT Helpdesk &amp; Support</h1><p className="mt-1 text-sm text-slate-500">{isAdmin ? "Manage, assign and resolve employee support requests." : "Raise a support request and track its progress."}</p></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={loadWorkspace} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
            <button type="button" onClick={() => { setError(""); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"><Plus size={17} />New Ticket</button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><XCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
        {message && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 size={18} />{message}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return <article key={stat.label} className="hrms-card hrms-enter rounded-2xl p-5" style={{ animationDelay: `${index * 70}ms` }}>
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{stat.label}</span><div className={`rounded-xl p-2.5 ${stat.tone}`}><Icon size={19} /></div></div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{loading ? "…" : stat.value}</p><p className="mt-1 text-xs text-slate-400">{stat.note}</p>
            </article>;
          })}
        </section>

        <section className="mb-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50 p-6 shadow-[0_18px_50px_rgba(79,70,229,0.08)]">
            <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="rounded-2xl bg-white p-3 text-indigo-700 shadow-sm"><MessageSquareText size={23} /></div>
              <div><p className="text-sm font-semibold text-indigo-700">Support desk</p><h2 className="mt-2 text-xl font-bold text-slate-900">{isAdmin ? "One place to manage every request" : "Need help with your work tools?"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{isAdmin ? "Review incoming tickets, assign them to an Admin or HR teammate, and keep employees informed with clear status updates." : "Describe the issue, choose its category and priority, then follow the ticket from Open through Resolution."}</p></div>
            </div>
            <div className="relative mt-6 flex flex-wrap items-center gap-3 border-t border-indigo-100 pt-5 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-emerald-600" />Role-based private access</span>
              <span className="inline-flex items-center gap-1.5"><UserRound size={15} className="text-indigo-600" />Admin / HR managed</span>
            </div>
          </article>
          <article className="hrms-card rounded-2xl p-6">
            <div className="mb-4 flex items-center gap-2"><Ticket size={19} className="text-indigo-600" /><h2 className="font-bold text-slate-900">Ticket lifecycle</h2></div>
            <div className="space-y-3">
              {[
                ["01", "Open", "Ticket submitted"],
                ["02", "In Progress", "Admin / HR handling the issue"],
                ["03", "Resolved", "Resolution provided"],
                ["04", "Closed", "Request completed"],
              ].map(([number, name, detail], index) => <div key={number} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${index === 0 ? "bg-amber-50 text-amber-700" : index === 1 ? "bg-blue-50 text-blue-700" : index === 2 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{number}</span>
                <div><p className="text-sm font-semibold text-slate-800">{name}</p><p className="text-xs text-slate-400">{detail}</p></div>
              </div>)}
            </div>
          </article>
        </section>

        {showForm && <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-6 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="new-ticket-title" className="hrms-enter my-auto w-full max-w-2xl rounded-[26px] border border-white/80 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.24)] sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Support request</p><h2 id="new-ticket-title" className="mt-1 text-2xl font-bold text-slate-900">Submit New Ticket</h2><p className="mt-1 text-sm text-slate-500">Provide enough detail for the support team to investigate.</p></div><button type="button" onClick={() => setShowForm(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={submitTicket} className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Issue category<select required value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className={labelClass}>Priority<select required value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass}>{priorities.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}</select></label>
              <label className={`${labelClass} sm:col-span-2`}>Subject<input required maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly describe the issue" className={inputClass} /></label>
              <label className={`${labelClass} sm:col-span-2`}>Description<textarea required minLength={5} maxLength={3000} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened? Include any error message and steps to reproduce." className={`${inputClass} resize-y`} /></label>
              <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5 sm:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}{busy ? "Submitting..." : "Submit Ticket"}</button></div>
            </form>
          </section>
        </div>}

        <section className="hrms-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div><h2 className="text-lg font-bold text-slate-900">{isAdmin ? "All Support Tickets" : "My Recent Tickets"}</h2><p className="mt-1 text-sm text-slate-500">{isAdmin ? "Assign requests and manage the support workflow." : "Only your submitted requests are visible here."}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets" className="w-44 rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 sm:w-52" /></div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400"><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
            </div>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />Loading support tickets...</div> : visibleTickets.length === 0 ? <div className="px-5 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Headset size={22} /></div><h3 className="mt-3 font-bold text-slate-800">No support tickets found</h3><p className="mt-1 text-sm text-slate-500">{search || statusFilter !== "all" ? "Try changing your search or status filter." : "Submit a ticket when you need help."}</p></div> : (
            <div className="divide-y divide-slate-100">
              {visibleTickets.map((item) => <article key={item._id} className="px-5 py-5 transition hover:bg-indigo-50/20 sm:px-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-indigo-700">{item.ticketNumber}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${priorityStyle(item.priority)}`}>{item.priority}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyle(item.status)}`}>{item.status.replace("_", " ")}</span></div>
                    <h3 className="text-base font-bold text-slate-900">{item.subject}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-500">{item.description}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>{categories.find((entry) => entry.value === item.category)?.label || item.category}</span><span>Submitted by {employeeName(item.createdBy)}</span><span>{dateLabel(item.createdAt)}</span></div>
                    {item.resolutionNote && <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Resolution note</p><p className="mt-1 text-sm text-emerald-900">{item.resolutionNote}</p></div>}
                  </div>
                  {isAdmin && item.status !== "closed" && <div className="w-full space-y-2 sm:w-56">
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">Assign to Admin / HR</label>
                    <select value={item.assignedTo?._id || ""} disabled={busy} onChange={(e) => void assignTicket(item._id, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50"><option value="">Unassigned</option>{(workspace?.assignees || []).map((person) => <option key={person._id} value={person._id}>{employeeName(person.employee)} · {person.role.toUpperCase()}</option>)}</select>
                    <div className="flex flex-wrap gap-1.5">
                      {item.status === "open" && <button type="button" disabled={busy} onClick={() => void updateStatus(item, "in_progress")} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">Start work</button>}
                      {(item.status === "open" || item.status === "in_progress") && <button type="button" disabled={busy} onClick={() => void updateStatus(item, "resolved")} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Resolve</button>}
                      {item.status === "resolved" && <><button type="button" disabled={busy} onClick={() => void updateStatus(item, "in_progress")} className="rounded-lg border border-blue-200 px-3 py-2 text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Reopen</button><button type="button" disabled={busy} onClick={() => void updateStatus(item, "closed")} className="rounded-lg bg-slate-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">Close</button></>}
                    </div>
                  </div>}
                  {!isAdmin && <div className="shrink-0 text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Assigned to</p><p className="mt-1 text-xs font-semibold text-slate-600">{item.assignedTo ? `${employeeName(item.assignedTo.employee)} · ${item.assignedTo.role.toUpperCase()}` : "Awaiting assignment"}</p></div>}
                </div>
              </article>)}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-400"><span>Showing up to 200 latest tickets</span><span className="inline-flex items-center gap-1"><ShieldCheck size={13} />Private ticket access</span></div>
        </section>
        <p className="mt-4 text-center text-xs text-slate-400">Employees can view only their own tickets. Admin / HR can view, assign and manage all support requests.</p>
      </div>
    </main>
  );
}

export default function HelpdeskPage() {
  return <AuthGuard><HelpdeskContent /></AuthGuard>;
}
