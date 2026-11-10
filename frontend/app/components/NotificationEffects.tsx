"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCircle2, Settings2, X, RotateCcw, Sparkles, Layers3, ScanFace, Zap, Eye, EyeOff, Mail } from "lucide-react";

type AnimationMode = "cinematic" | "flip" | "hologram" | "slide";
type ToastItem = { id: number; message: string; kind: "success" | "error"; time: string };
const MODES: { id: AnimationMode; label: string; hint: string; icon: typeof Sparkles }[] = [
  { id: "cinematic", label: "Cinematic 3D", hint: "Depth + zoom", icon: Sparkles },
  { id: "flip", label: "3D Flip", hint: "Card rotation", icon: Layers3 },
  { id: "hologram", label: "Hologram", hint: "Neon + blur", icon: ScanFace },
  { id: "slide", label: "Dynamic", hint: "3D slide", icon: Zap },
];

type SoundWindow = Window & { __hrmsAudioContext?: AudioContext; __hrmsAudioReady?: boolean };
function prepareAudio() {
  const w = window as SoundWindow;
  if (w.__hrmsAudioReady || !window.AudioContext) return;
  try {
    const audio = w.__hrmsAudioContext || new AudioContext();
    w.__hrmsAudioContext = audio;
    void audio.resume();
    w.__hrmsAudioReady = true;
  } catch { /* visual notification remains available */ }
}
function playNotificationSound(kind: "success" | "error") {
  const audio = (window as SoundWindow).__hrmsAudioContext;
  if (!audio || audio.state !== "running") return;
  const notes = kind === "error" ? [330, 247] : [660, 880];
  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const at = audio.currentTime + index * 0.12;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.035, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(at); oscillator.stop(at + 0.19);
  });
}

export default function NotificationEffects() {
  const [mode, setMode] = useState<AnimationMode>("cinematic");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [items, setItems] = useState<ToastItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [dockHidden, setDockHidden] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [canManageGmail, setCanManageGmail] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setCanManageGmail(user.role === "admin" || user.role === "hr");
    } catch { setCanManageGmail(false); }
    const saved = localStorage.getItem("hrms_approval_animation_mode");
    if (saved === "cinematic" || saved === "flip" || saved === "hologram" || saved === "slide") setMode(saved);
    const unlock = () => prepareAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const lastMessage = new WeakMap<Element, string>();
    let sequence = 0;
    const announce = (element: Element | null) => {
      if (!element) return;
      const role = element.getAttribute("role");
      if (role !== "status" && role !== "alert") return;
      const message = element.textContent?.trim() || "";
      if (!message || lastMessage.get(element) === message) return;
      lastMessage.set(element, message);
      const kind = role === "alert" ? "error" : "success";
      const id = ++sequence;
      const entry = { id, message, kind, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } as ToastItem;
      setItems(current => [entry, ...current].slice(0, 5));
      setUnread(current => current + 1);
      playNotificationSound(kind);
      window.setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 6500);
    };
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        announce(target?.closest('[role="status"], [role="alert"]') || null);
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          announce(node.matches('[role="status"], [role="alert"]') ? node : node.querySelector('[role="status"], [role="alert"]'));
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["role"] });
    const modeChanged = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next === "cinematic" || next === "flip" || next === "hologram" || next === "slide") setMode(next);
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== "hrms_approval_animation_mode") return;
      const next = event.newValue;
      if (next === "cinematic" || next === "flip" || next === "hologram" || next === "slide") setMode(next);
    };
    window.addEventListener("hrms-animation-mode-changed", modeChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("hrms-animation-mode-changed", modeChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  const selectMode = (next: AnimationMode) => {
    setMode(next);
    localStorage.setItem("hrms_approval_animation_mode", next);
    window.dispatchEvent(new CustomEvent("hrms-animation-mode-changed", { detail: next }));
  };
  const clearNotifications = () => { setItems([]); setUnread(0); };

  return (
    <>
      {dockHidden ? (
        <button type="button" aria-label="Show quick controls" title="Show quick controls" onClick={() => setDockHidden(false)} className="fixed bottom-4 right-4 z-[100] flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-slate-900/35 text-white/80 shadow-lg backdrop-blur-2xl transition hover:bg-slate-900/60 hover:text-white">
          <Eye size={16} />
        </button>
      ) : (
        <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-1 rounded-xl border border-white/25 bg-slate-900/35 p-1 shadow-[0_10px_35px_-14px_rgba(15,23,42,.55)] backdrop-blur-2xl">
          <button type="button" aria-label="Notifications" title="Notifications" onClick={() => { setNotificationsOpen(v => !v); setSettingsOpen(false); setUnread(0); }} className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/15 ${notificationsOpen ? "bg-white/20 text-white" : "text-white/75"}`}>
            <Bell size={15} />
            {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-900/50 bg-rose-500 px-1 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button type="button" aria-label="Appearance settings" title="Appearance settings" onClick={() => { setSettingsOpen(v => !v); setNotificationsOpen(false); }} className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/15 ${settingsOpen ? "bg-indigo-400/35 text-white" : "text-white/75"}`}>
            <Settings2 size={15} />
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/20" />
          <button type="button" aria-label="Hide quick controls" title="Hide quick controls" onClick={() => { setDockHidden(true); setSettingsOpen(false); setNotificationsOpen(false); }} className="flex h-8 w-7 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/15 hover:text-white">
            <EyeOff size={14} />
          </button>
        </div>
      )}

      {settingsOpen && <div className="fixed bottom-[5.25rem] right-4 z-[101] w-[min(410px,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-white/20 bg-[#080d1c]/95 text-white shadow-[0_30px_100px_-24px_rgba(2,6,23,.85)] backdrop-blur-3xl animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-300">
        <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" /><div className="absolute -left-20 top-36 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" /><div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.07),transparent_38%,rgba(99,102,241,.06))]" /></div>
        <div className="relative border-b border-white/10 bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-cyan-500/10 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]"><Settings2 size={20} /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-indigo-200/80">Workspace control</p><h2 className="mt-0.5 text-lg font-black tracking-tight text-white">Settings Center</h2><p className="mt-0.5 text-[11px] text-slate-400">Personalize your HRMS experience</p></div></div><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)} className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/25 hover:bg-white/15 hover:text-white"><X size={16} /></button></div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-2"><span className="flex items-center gap-2 text-[11px] font-semibold text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.9)]" /> Preferences saved automatically</span><span className="text-[9px] font-bold uppercase tracking-wider text-emerald-200/60">Live</span></div>
        </div>
        <div className="relative max-h-[min(65vh,560px)] space-y-4 overflow-y-auto p-4">
          <section><div className="mb-2.5 flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-indigo-200/75">Appearance studio</p><p className="mt-0.5 text-xs text-slate-400">Choose confirmation animation style</p></div><Sparkles size={16} className="text-indigo-300" /></div>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(item => { const Icon = item.icon; const active = mode === item.id; return <button key={item.id} type="button" aria-pressed={active} onClick={() => selectMode(item.id)} className={`group relative flex min-h-[76px] items-center gap-2.5 overflow-hidden rounded-2xl border p-3 text-left transition duration-200 hover:-translate-y-0.5 ${active ? "border-indigo-300/60 bg-gradient-to-br from-indigo-400/25 to-violet-500/15 shadow-[0_8px_28px_-12px_rgba(129,140,248,.7)]" : "border-white/10 bg-white/[0.045] hover:border-white/25 hover:bg-white/[0.09]"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${active ? "border-indigo-200/30 bg-indigo-300/20 text-indigo-100" : "border-white/10 bg-white/5 text-slate-400 group-hover:text-white"}`}><Icon size={17} /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-white">{item.label}</span><span className="mt-1 block text-[9px] text-slate-400">{item.hint}</span></span>{active && <CheckCircle2 size={14} className="absolute right-2 top-2 text-indigo-200" />}</button>; })}
            </div>
          </section>
          {canManageGmail && <section><div className="mb-2.5 flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-rose-200/80">Connected services</p><p className="mt-0.5 text-xs text-slate-400">Manage company integrations</p></div><span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-2 py-1 text-[9px] font-bold text-rose-200">ADMIN / HR</span></div><button type="button" onClick={() => { setSettingsOpen(false); setGmailOpen(true); }} className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[.08] via-white/[.045] to-rose-400/[.08] p-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.08)] transition duration-200 hover:-translate-y-0.5 hover:border-rose-300/35 hover:bg-rose-400/10"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/15 text-rose-200 shadow-[0_6px_22px_-10px_rgba(251,113,133,.6)]"><Mail size={19} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white">Google Gmail Integration</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">Connect company Gmail and review employee-related messages</span></span><span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-rose-100 transition group-hover:border-rose-200/30 group-hover:bg-rose-300/15">OPEN ↗</span></button></section>}
          <div className="flex items-center justify-between border-t border-white/10 pt-3"><span className="text-[10px] text-slate-500">Settings apply instantly on this browser</span><button type="button" onClick={() => selectMode("cinematic")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-slate-300 transition hover:border-indigo-300/30 hover:bg-indigo-400/10 hover:text-white"><RotateCcw size={12} /> Reset style</button></div>
        </div>
      </div>}

      {gmailOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) setGmailOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Google Gmail Integration" className="flex h-[min(900px,94vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/30 bg-white shadow-[0_30px_100px_-20px_rgba(0,0,0,.55)] animate-in zoom-in-95 fade-in duration-200">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-red-950 px-4 py-3 text-white sm:px-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2"><Mail size={18} /></span><div><h2 className="text-sm font-bold">Google Gmail Integration</h2><p className="text-[10px] text-slate-300">Company account settings</p></div></div><button type="button" aria-label="Close Gmail integration" onClick={() => setGmailOpen(false)} className="rounded-lg p-2 text-white/70 transition hover:bg-white/15 hover:text-white"><X size={18} /></button></header>
          <iframe title="Google Gmail Integration settings" src="/integrations/google-gmail?popup=1" className="min-h-0 w-full flex-1 border-0 bg-slate-50" />
        </section>
      </div>}

      {notificationsOpen && <div className="fixed bottom-[5.25rem] right-[4.5rem] z-[101] w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_24px_70px_-18px_rgba(15,23,42,.42)] backdrop-blur-2xl animate-in slide-in-from-bottom-3 fade-in duration-200">
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-950/80 via-slate-900/75 to-indigo-950/75 px-4 py-3.5 text-white"><div className="flex items-center gap-2.5"><span className="rounded-lg bg-white/10 p-2"><Bell size={16} /></span><div><p className="text-sm font-bold">Notifications</p><p className="text-[10px] text-slate-300">{items.length} recent updates</p></div></div><div className="flex items-center gap-1"><button type="button" onClick={clearNotifications} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-white/10">Clear</button><button type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X size={16} /></button></div></div>
        <div className="max-h-72 overflow-y-auto p-2.5">{items.length === 0 ? <div className="px-3 py-8 text-center"><CheckCircle2 size={23} className="mx-auto text-emerald-500" /><p className="mt-2 text-xs font-semibold text-slate-600">You’re all caught up</p><p className="mt-1 text-[10px] text-white/55">New system updates will appear here</p></div> : items.map(item => <div key={item.id} className="mb-1 flex gap-2.5 rounded-xl border border-white/10 bg-white/10 p-3 last:mb-0"><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "success" ? "bg-emerald-500" : "bg-rose-500"}`} /><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold leading-5 text-white">{item.message}</p><p className="mt-1 text-[10px] text-white/50">{item.time}</p></div></div>)}</div>
      </div>}

      <div className="pointer-events-none fixed bottom-[5.25rem] right-5 z-[99] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
        {items.slice(0, 3).map(item => <div key={item.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/25 bg-slate-950/70 p-3.5 shadow-[0_16px_45px_-15px_rgba(15,23,42,.45)] backdrop-blur-2xl animate-in slide-in-from-right-4 fade-in duration-300"><span className={`mt-0.5 rounded-lg p-2 ${item.kind === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{item.kind === "success" ? <CheckCircle2 size={17} /> : <X size={17} />}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{item.kind === "success" ? "Success" : "Needs attention"}</p><p className="mt-0.5 break-words text-xs font-semibold leading-5 text-white">{item.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setItems(current => current.filter(x => x.id !== item.id))} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button></div>)}
      </div>
    </>
  );
}
