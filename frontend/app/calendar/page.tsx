"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, X, Clock3, MapPin } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API = "http://localhost:5000/api";
type EventItem = { _id: string; title: string; description?: string; eventType: "meeting" | "company_event" | "training" | "other"; startAt: string; endAt: string; allDay: boolean; location?: string };
type Holiday = { _id: string; name: string; dateKey: string; type: string };
type Leave = { _id: string; leaveType: string; startDate: string; endDate: string; status: string; employee?: { firstName?: string; lastName?: string } };
type Attendance = { _id: string; dateKey: string; status: string; employee?: { firstName?: string; lastName?: string } };
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const labelOf = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

function CalendarContent() {
  const [role, setRole] = useState("employee");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(keyOf(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", eventType: "meeting", startAt: "", endAt: "", allDay: false, location: "", description: "" });
  const isAdmin = role === "admin" || role === "hr";
  const from = keyOf(month);
  const to = keyOf(new Date(month.getFullYear(), month.getMonth()+1, 0));

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) throw new Error("Please login again.");
    const response = await fetch(API + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store" });
    const result = await response.json();
    if (response.status === 401) { sessionStorage.removeItem("hrms_token"); sessionStorage.removeItem("hrms_user"); window.location.href = "/login"; throw new Error("Session expired."); }
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const eventFrom = new Date(`${from}T00:00:00`).toISOString();
      const eventTo = new Date(`${to}T23:59:59.999`).toISOString();
      const attendancePath = isAdmin || role === "manager" ? `/attendance?from=${from}&to=${to}` : `/attendance/me?from=${from}&to=${to}`;
      const [e,h,l,a] = await Promise.all([
        request(`/calendar/events?from=${encodeURIComponent(eventFrom)}&to=${encodeURIComponent(eventTo)}`),
        request(`/holidays?from=${from}&to=${to}`),
        request("/leaves"),
        request(attendancePath)
      ]);
      setEvents(e.data || []); setHolidays(h.data || []); setLeaves(l.data || []); setAttendance(a.data || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load calendar"); }
    finally { setLoading(false); }
  }, [from,to,isAdmin,role,request]);

  useEffect(() => {
    try { const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}"); if (user.role) setRole(user.role); } catch {}
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(),month.getMonth(),1);
    const offset = first.getDay();
    const total = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    const out: {key:string;day:number;inMonth:boolean}[] = [];
    for(let i=0;i<offset;i++){const d=new Date(first);d.setDate(d.getDate()-offset+i);out.push({key:keyOf(d),day:d.getDate(),inMonth:false});}
    for(let d=1;d<=total;d++)out.push({key:keyOf(new Date(month.getFullYear(),month.getMonth(),d)),day:d,inMonth:true});
    while(out.length%7){const d=new Date(out[out.length-1].key+"T00:00:00");d.setDate(d.getDate()+1);out.push({key:keyOf(d),day:d.getDate(),inMonth:false});}
    return out;
  },[month]);

  const onDay = (k:string) => ({
    event: events.some(x=>keyOf(new Date(x.startAt))<=k&&keyOf(new Date(x.endAt))>=k),
    holiday: holidays.some(x=>x.dateKey===k),
    leave: leaves.some(x=>["pending","approved"].includes(x.status)&&x.startDate<=k&&x.endDate>=k),
    attendance: attendance.some(x=>x.dateKey===k)
  });
  const dayEvents=events.filter(x=>keyOf(new Date(x.startAt))<=selected&&keyOf(new Date(x.endAt))>=selected);
  const dayHolidays=holidays.filter(x=>x.dateKey===selected);
  const dayLeaves=leaves.filter(x=>["pending","approved"].includes(x.status)&&x.startDate<=selected&&x.endDate>=selected);
  const dayAttendance=attendance.filter(x=>x.dateKey===selected);
  const selectedLabel=new Date(selected+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});

  const createEvent=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setSaving(true);setError("");setNotice("");
    try{
      const body={...form,startAt:new Date(form.startAt).toISOString(),endAt:new Date(form.endAt).toISOString()};
      const result=await request("/calendar/events",{method:"POST",body:JSON.stringify(body)});
      setNotice(result.message||"Event created.");setShowForm(false);
      setForm({title:"",eventType:"meeting",startAt:"",endAt:"",allDay:false,location:"",description:""});
      await load();
    }catch(err){setError(err instanceof Error?err.message:"Unable to create event");}
    finally{setSaving(false);}
  };

  return <main className="hrms-enter min-h-screen px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1440px]">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"><ArrowLeft size={16}/>Dashboard</Link><div className="flex items-center gap-3"><div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 p-3 text-white shadow-lg"><CalendarDays size={25}/></div><div><h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Company Calendar</h1><p className="mt-1 text-sm text-slate-500">Company events, holidays, leave and attendance in one view.</p></div></div></div><div className="flex gap-2"><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw size={15} className={loading?"animate-spin":""}/>Refresh</button>{isAdmin&&<button onClick={()=>setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16}/>Add event</button>}</div></header>
    {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}{notice&&<div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Calendar overview</p><h2 className="mt-1 text-xl font-bold text-slate-900">{labelOf(month)}</h2></div><div className="flex items-center gap-2"><button aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="rounded-xl border border-slate-200 p-2"><ChevronLeft size={18}/></button><button onClick={()=>{const n=new Date();setMonth(new Date(n.getFullYear(),n.getMonth(),1));setSelected(keyOf(n));}} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Today</button><button aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="rounded-xl border border-slate-200 p-2"><ChevronRight size={18}/></button></div></div>
        <div className="mb-2 grid grid-cols-7 gap-1">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="py-2 text-center text-[11px] font-bold uppercase text-slate-400">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1.5">{cells.map(c=>{const f=onDay(c.key);const active=selected===c.key;const today=c.key===keyOf(new Date());return <button key={c.key} onClick={()=>setSelected(c.key)} className={`flex min-h-[74px] flex-col items-center rounded-xl border p-2 transition sm:min-h-[92px] ${active?"border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100":"border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50"} ${c.inMonth?"":"opacity-35"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${today?"bg-slate-900 text-white":active?"text-indigo-700":"text-slate-700"}`}>{c.day}</span><span className="mt-auto flex min-h-4 flex-wrap justify-center gap-1 pt-2">{f.event&&<i title="Event" className="h-1.5 w-1.5 rounded-full bg-violet-500"/>}{f.holiday&&<i title="Holiday" className="h-1.5 w-1.5 rounded-full bg-rose-500"/>}{f.leave&&<i title="Leave" className="h-1.5 w-1.5 rounded-full bg-amber-500"/>}{f.attendance&&<i title="Attendance" className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>}</span></button>;})}</div>
        <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-violet-500"/>Events</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-rose-500"/>Holidays</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-amber-500"/>Leave</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-500"/>Attendance</span></div>
      </section>
      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Selected day</p><h2 className="mb-5 mt-1 text-lg font-bold text-slate-900">{selectedLabel}</h2>{loading?<p className="py-8 text-center text-sm text-slate-400">Loading…</p>:<div className="space-y-5">
        <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Company events</h3>{dayEvents.length?dayEvents.map(x=><article key={x._id} className="mb-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3"><p className="text-sm font-bold text-slate-900">{x.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><Clock3 size={12}/>{x.allDay?"All day":new Date(x.startAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})+" – "+new Date(x.endAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p>{x.location&&<p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12}/>{x.location}</p>}{x.description&&<p className="mt-2 text-xs text-slate-600">{x.description}</p>}</article>):<p className="text-xs text-slate-400">No events scheduled.</p>}</div>
        <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Holidays</h3>{dayHolidays.length?dayHolidays.map(x=><p key={x._id} className="mb-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-semibold text-slate-800">{x.name}<span className="mt-1 block text-xs font-normal capitalize text-rose-700">{x.type} holiday</span></p>):<p className="text-xs text-slate-400">No holiday.</p>}</div>
        <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Leave</h3>{dayLeaves.length?dayLeaves.map(x=><p key={x._id} className="mb-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-slate-800">{x.employee?`${x.employee.firstName||""} ${x.employee.lastName||""}`.trim():"Employee"} · {x.leaveType}<span className="mt-1 block text-xs font-normal capitalize text-amber-700">{x.status}</span></p>):<p className="text-xs text-slate-400">No pending or approved leave.</p>}</div>
        <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-400">Attendance</h3>{dayAttendance.length?dayAttendance.map(x=><p key={x._id} className="mb-2 flex justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm"><span className="font-semibold text-slate-800">{x.employee?`${x.employee.firstName||""} ${x.employee.lastName||""}`.trim():"Attendance"}</span><span className="text-xs font-bold capitalize text-emerald-700">{x.status}</span></p>):<p className="text-xs text-slate-400">No attendance record.</p>}</div>
      </div>}</aside>
    </div>
    <div className="mt-5 flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-500"><span>Existing attendance and leave actions remain in their original modules.</span><Link href="/attendance" className="font-semibold text-indigo-700">Attendance</Link><Link href="/holidays" className="font-semibold text-indigo-700">Holiday management</Link></div>
    {showForm&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false);}}><section role="dialog" aria-modal="true" className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-xs font-bold uppercase text-indigo-600">Company calendar</p><h2 className="mt-1 text-lg font-bold text-slate-900">Create event</h2></div><button onClick={()=>setShowForm(false)} aria-label="Close" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></header><form onSubmit={createEvent} className="space-y-4 p-5">
      <label className="block text-xs font-bold text-slate-600">Event title<input required maxLength={140} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Monthly town hall"/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Event type<select value={form.eventType} onChange={e=>setForm(v=>({...v,eventType:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="meeting">Meeting</option><option value="company_event">Company event</option><option value="training">Training</option><option value="other">Other</option></select></label><label className="text-xs font-bold text-slate-600">Location<input value={form.location} onChange={e=>setForm(v=>({...v,location:e.target.value}))} maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Conference room"/></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Starts<input required type="datetime-local" value={form.startAt} onChange={e=>setForm(v=>({...v,startAt:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/></label><label className="text-xs font-bold text-slate-600">Ends<input required type="datetime-local" min={form.startAt||undefined} value={form.endAt} onChange={e=>setForm(v=>({...v,endAt:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/></label></div>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.allDay} onChange={e=>setForm(v=>({...v,allDay:e.target.checked}))}/>All-day event</label>
      <label className="block text-xs font-bold text-slate-600">Description<textarea rows={3} maxLength={2000} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/></label>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?"Saving…":"Create event"}</button></div>
    </form></section></div>}
  </div></main>;
}
export default function CompanyCalendarPage(){return <AuthGuard><CalendarContent/></AuthGuard>;}
