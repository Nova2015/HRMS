"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, CircleHelp, FileText, Headset, LifeBuoy, Mail, MessageCircle, Search, ShieldCheck, Users } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const articles = [
  {category:"Account & access",title:"How do I update my profile?",body:"Open your profile from the top-right profile icon. Review your personal details and save any fields available to you. For protected employment or payroll details, contact HR."},
  {category:"Attendance",title:"How do I record attendance?",body:"Open Attendance from the sidebar. Use the available check-in and check-out actions and review your daily attendance details in the calendar."},
  {category:"Leave management",title:"How do I apply for leave?",body:"Open Leave Management, choose the leave type and dates, add a reason, then submit the application. You can track its approval status on the same page."},
  {category:"Calendar",title:"How does Google Calendar sync work?",body:"When the company Google account is connected, supported HRMS meetings and company events can synchronize with Google Calendar. Gmail scanning only shows detected meeting and event candidates for review; it does not automatically create Calendar events."},
  {category:"Integrations",title:"How do I connect or reconnect Google?",body:"Open Settings → Integrations. Admin and HR can connect, reconnect or disconnect the approved company Google account."},
  {category:"Security",title:"How do I reset my password?",body:"Contact your Admin or HR team for password assistance. Employee self-service password reset is not enabled."},
  {category:"IT Support",title:"How do I report a technical issue?",body:"Open IT Support from the sidebar, select New Ticket, describe the issue and choose its category and priority. You can track the ticket status from the same page."},
];

function HelpCenterContent(){
  const [query,setQuery]=useState("");
  const [open,setOpen]=useState<number|null>(0);
  const filtered=articles.filter(a=>(a.title+" "+a.category+" "+a.body).toLowerCase().includes(query.toLowerCase()));
  return <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-indigo-700"><ArrowLeft size={14}/>Back to Dashboard</Link>
      <section className="relative overflow-hidden rounded-[26px] border border-white/80 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50/90 p-6 shadow-[0_20px_60px_rgba(79,70,229,.09)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-200/40 blur-3xl"/>
        <div className="relative"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/20"><LifeBuoy size={21}/></span><p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.2em] text-indigo-600">HRMS support</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Help Center</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Find quick answers about your account, attendance, leave, calendar and HRMS tools.</p>
          <label className="mt-5 flex max-w-xl items-center gap-3 rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm"><Search size={17} className="text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search help articles..." className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"/></label>
        </div>
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[{label:"Account & profile",icon:Users,detail:"Profile and access"},{label:"Attendance & leave",icon:CalendarDays,detail:"Daily HR workflows"},{label:"Policies & security",icon:ShieldCheck,detail:"Safe account usage"}].map(item=>{const Icon=item.icon;return <article key={item.label} className="hrms-card rounded-2xl p-4"><Icon size={18} className="text-indigo-600"/><h2 className="mt-3 text-xs font-bold text-slate-800">{item.label}</h2><p className="mt-1 text-[10px] text-slate-500">{item.detail}</p></article>;})}
      </div>
      <section className="mt-6 rounded-[24px] border border-white/80 bg-white/85 p-5 shadow-[0_16px_45px_rgba(15,23,42,.06)] sm:p-6">
        <div className="mb-4 flex items-center gap-2"><BookOpen size={17} className="text-indigo-600"/><h2 className="text-sm font-extrabold text-slate-900">Frequently asked questions</h2><span className="ml-auto text-[10px] text-slate-400">{filtered.length} articles</span></div>
        {filtered.length===0?<p className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">No articles match your search.</p>:<div className="divide-y divide-slate-100">{filtered.map((article,index)=><article key={article.title} className="py-1"><button type="button" onClick={()=>setOpen(open===index?null:index)} className="flex w-full items-center justify-between gap-3 py-3 text-left"><span><span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-500">{article.category}</span><span className="mt-1 block text-xs font-bold text-slate-800">{article.title}</span></span><ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open===index?"rotate-180":""}`}/></button>{open===index&&<p className="pb-4 pr-7 text-xs leading-6 text-slate-500">{article.body}</p>}</article>)}</div>}
      </section>
      <section className="mt-5 flex flex-col justify-between gap-4 rounded-[24px] border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/80 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><Headset size={19}/></span><div><h2 className="text-sm font-extrabold text-slate-900">Still need help?</h2><p className="mt-1 text-xs leading-5 text-slate-500">Raise a support ticket and our Admin / HR team can assist.</p></div></div>
        <Link href="/helpdesk" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/15"><MessageCircle size={14}/>Open IT Support</Link>
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Mail size={12}/>Contact your HR / Admin</span><span className="inline-flex items-center gap-1.5"><FileText size={12}/>HRMS Help & Guides</span><Link href="/settings" className="font-semibold text-indigo-500 hover:text-indigo-700">Settings</Link></div>
    </div>
  </main>;
}
export default function HelpCenterPage(){return <AuthGuard><HelpCenterContent/></AuthGuard>;}
