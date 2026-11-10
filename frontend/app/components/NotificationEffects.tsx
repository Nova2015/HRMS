"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCircle2, Settings2, X, RotateCcw, Sparkles, Layers3, ScanFace, Zap } from "lucide-react";

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

  useEffect(() => {
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
      <div className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-2xl border border-white/70 bg-slate-950/90 p-2 shadow-[0_18px_55px_-16px_rgba(15,23,42,.65)] backdrop-blur-2xl">
        <button type="button" aria-label="Notifications" onClick={() => { setNotificationsOpen(v => !v); setSettingsOpen(false); setUnread(0); }} className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-white/15 ${notificationsOpen ? "bg-white/15 text-white" : "text-slate-300"}`}>
          <Bell size={19} />
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-rose-500 px-1 text-[10px] font-extrabold text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
        <span className="h-7 w-px bg-white/15" />
        <button type="button" aria-label="Appearance settings" onClick={() => { setSettingsOpen(v => !v); setNotificationsOpen(false); }} className={`flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-white/15 ${settingsOpen ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-slate-300"}`}>
          <Settings2 size={20} />
        </button>
      </div>

      {settingsOpen && <div className="fixed bottom-[5.25rem] right-5 z-[101] w-[min(340px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_24px_70px_-18px_rgba(15,23,42,.42)] backdrop-blur-2xl animate-in slide-in-from-bottom-3 fade-in duration-200">
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-900 px-4 py-3.5 text-white"><div className="flex items-center gap-2.5"><span className="rounded-lg bg-white/10 p-2"><Sparkles size={17} /></span><div><p className="text-sm font-bold">Quick appearance</p><p className="text-[10px] text-indigo-200">Confirmation animation</p></div></div><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"><X size={17} /></button></div>
        <div className="p-3">
          {MODES.map(item => { const Icon = item.icon; const active = mode === item.id; return <button key={item.id} type="button" aria-pressed={active} onClick={() => selectMode(item.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition last:mb-0 ${active ? "border-indigo-200 bg-indigo-50 shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25" : "bg-slate-100 text-slate-500"}`}><Icon size={17} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{item.label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{item.hint}</span></span>{active && <Check size={17} className="text-indigo-600" />}</button>; })}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-[10px] text-slate-400">Saved automatically on this browser</span><button type="button" onClick={() => selectMode("cinematic")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100"><RotateCcw size={12} /> Reset</button></div>
        </div>
      </div>}

      {notificationsOpen && <div className="fixed bottom-[5.25rem] right-[4.5rem] z-[101] w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_24px_70px_-18px_rgba(15,23,42,.42)] backdrop-blur-2xl animate-in slide-in-from-bottom-3 fade-in duration-200">
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-3.5 text-white"><div className="flex items-center gap-2.5"><span className="rounded-lg bg-white/10 p-2"><Bell size={16} /></span><div><p className="text-sm font-bold">Notifications</p><p className="text-[10px] text-slate-300">{items.length} recent updates</p></div></div><div className="flex items-center gap-1"><button type="button" onClick={clearNotifications} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-white/10">Clear</button><button type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X size={16} /></button></div></div>
        <div className="max-h-72 overflow-y-auto p-2.5">{items.length === 0 ? <div className="px-3 py-8 text-center"><CheckCircle2 size={23} className="mx-auto text-emerald-500" /><p className="mt-2 text-xs font-semibold text-slate-600">You’re all caught up</p><p className="mt-1 text-[10px] text-slate-400">New system updates will appear here</p></div> : items.map(item => <div key={item.id} className="mb-1 flex gap-2.5 rounded-xl border border-slate-100 bg-white p-3 last:mb-0"><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "success" ? "bg-emerald-500" : "bg-rose-500"}`} /><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold leading-5 text-slate-700">{item.message}</p><p className="mt-1 text-[10px] text-slate-400">{item.time}</p></div></div>)}</div>
      </div>}

      <div className="pointer-events-none fixed bottom-[5.25rem] right-5 z-[99] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
        {items.slice(0, 3).map(item => <div key={item.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/80 bg-white/95 p-3.5 shadow-[0_16px_45px_-15px_rgba(15,23,42,.35)] backdrop-blur-xl animate-in slide-in-from-right-4 fade-in duration-300"><span className={`mt-0.5 rounded-lg p-2 ${item.kind === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{item.kind === "success" ? <CheckCircle2 size={17} /> : <X size={17} />}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{item.kind === "success" ? "Success" : "Needs attention"}</p><p className="mt-0.5 break-words text-xs font-semibold leading-5 text-slate-700">{item.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setItems(current => current.filter(x => x.id !== item.id))} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button></div>)}
      </div>
    </>
  );
}
