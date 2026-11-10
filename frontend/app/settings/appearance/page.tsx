"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, MonitorCog, RotateCcw, Save, Sparkles, Layers3, Zap, ScanFace } from "lucide-react";
import AuthGuard from "../../components/AuthGuard";

type AnimationMode = "cinematic" | "flip" | "hologram" | "slide";

const MODES: { id: AnimationMode; name: string; subtitle: string; description: string; icon: typeof Sparkles; accent: string; preview: string }[] = [
  { id: "cinematic", name: "Cinematic 3D", subtitle: "Depth + zoom", description: "A smooth perspective entrance with layered depth, soft zoom and cinematic lighting.", icon: Sparkles, accent: "from-indigo-600 to-violet-600", preview: "animate-[settingsCinematic_.9s_cubic-bezier(.2,.8,.2,1)_infinite_alternate]" },
  { id: "flip", name: "3D Flip", subtitle: "Card rotation", description: "The confirmation card rotates into view with a crisp 3D flip and spring finish.", icon: Layers3, accent: "from-sky-600 to-blue-600", preview: "animate-[settingsFlip_.9s_ease-in-out_infinite_alternate]" },
  { id: "hologram", name: "Hologram", subtitle: "Neon + blur reveal", description: "A luminous holographic reveal with neon edge glow, hue shift and blur clearing.", icon: ScanFace, accent: "from-fuchsia-600 to-cyan-500", preview: "animate-[settingsHolo_1.1s_ease-in-out_infinite_alternate]" },
  { id: "slide", name: "Dynamic", subtitle: "3D slide", description: "A responsive 3D slide-in with directional movement and subtle rotation.", icon: Zap, accent: "from-emerald-600 to-teal-500", preview: "animate-[settingsSlide_.9s_ease-in-out_infinite_alternate]" },
];

function AppearanceSettings() {
  const [mode, setMode] = useState<AnimationMode>("cinematic");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const current = window.localStorage.getItem("hrms_approval_animation_mode");
    if (current === "cinematic" || current === "flip" || current === "hologram" || current === "slide") setMode(current);
  }, []);

  const save = () => {
    window.localStorage.setItem("hrms_approval_animation_mode", mode);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const reset = () => {
    setMode("cinematic");
    window.localStorage.setItem("hrms_approval_animation_mode", "cinematic");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#eef2ff,_#f8fafc_48%,_#f1f5f9)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ArrowLeft size={16} /> Back to Dashboard</Link>
        <section className="overflow-hidden rounded-[28px] border border-white bg-white/90 shadow-[0_24px_80px_-32px_rgba(30,41,59,.3)] backdrop-blur-xl">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-6 py-8 text-white sm:px-9 sm:py-10">
            <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full border-[35px] border-white/[.06]" />
            <div className="absolute -bottom-28 right-1/3 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative flex items-center gap-4"><div className="rounded-2xl border border-white/20 bg-white/10 p-3 shadow-xl backdrop-blur"><MonitorCog size={28} /></div><div><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-200">Personal preferences</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Appearance & Animation</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100/80">Choose how approval confirmation dialogs appear. Your selection is saved in this browser and applied automatically.</p></div></div>
          </div>
          <div className="p-6 sm:p-9">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-900">Confirmation animation mode</h2><p className="mt-1 text-sm text-slate-500">Select a style. Preview motion is shown on each option.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">4 available modes</span></div>
            <div className="grid gap-4 sm:grid-cols-2">
              {MODES.map((item) => {
                const Icon = item.icon;
                const selected = mode === item.id;
                return <button key={item.id} type="button" aria-pressed={selected} onClick={() => { setMode(item.id); setSaved(false); }} className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl ${selected ? "border-indigo-500 bg-indigo-50/70 shadow-lg shadow-indigo-100 ring-2 ring-indigo-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="flex items-start justify-between gap-3"><div className={`rounded-xl bg-gradient-to-br ${item.accent} p-3 text-white shadow-lg`}><Icon size={22} /></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{selected ? "Selected" : "Preview"}</span></div>
                  <div className="my-5 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-slate-950 [perspective:900px]"><div className={`h-16 w-32 rounded-xl border border-white/30 bg-gradient-to-br ${item.accent} shadow-[0_15px_35px_-12px_rgba(0,0,0,.7)] ${item.preview}`}><div className="m-3 h-2 w-12 rounded-full bg-white/80" /><div className="mx-3 h-2 w-20 rounded-full bg-white/40" /><div className="mx-3 mt-2 h-2 w-14 rounded-full bg-white/25" /></div></div>
                  <h3 className="font-extrabold text-slate-900">{item.name}</h3><p className="mt-0.5 text-xs font-semibold text-indigo-600">{item.subtitle}</p><p className="mt-2 text-sm leading-5 text-slate-500">{item.description}</p>
                </button>;
              })}
            </div>
            <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><RotateCcw size={16} /> Reset to default</button><div className="flex items-center gap-3">{saved && <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Check size={16} /> Preference saved</span>}<button type="button" onClick={save} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"><Save size={16} /> Save preference</button></div></div>
            <p className="mt-4 text-xs text-slate-400">This preference is stored locally in your current browser. It does not change approval permissions or employee data.</p>
          </div>
        </section>
      </div>
      <style jsx>{`
        @keyframes settingsCinematic { from { transform:perspective(900px) translateY(12px) rotateX(16deg) scale(.88); opacity:.55; } to { transform:perspective(900px) translateY(-3px) rotateX(0) scale(1.04); opacity:1; } }
        @keyframes settingsFlip { from { transform:perspective(900px) rotateY(75deg) scale(.82); } to { transform:perspective(900px) rotateY(0) scale(1.04); } }
        @keyframes settingsHolo { from { transform:perspective(900px) rotateX(22deg) rotateY(-18deg); filter:blur(7px) hue-rotate(100deg); opacity:.45; } to { transform:perspective(900px) rotateX(0) rotateY(0); filter:blur(0) hue-rotate(0); opacity:1; } }
        @keyframes settingsSlide { from { transform:perspective(900px) translate3d(45px,12px,-50px) rotateY(-22deg); opacity:.4; } to { transform:perspective(900px) translate3d(0,0,0) rotateY(0); opacity:1; } }
        @media (prefers-reduced-motion: reduce) { :global(*) { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
      `}</style>
    </main>
  );
}

export default function AppearanceSettingsPage() {
  return <AuthGuard><AppearanceSettings /></AuthGuard>;
}
