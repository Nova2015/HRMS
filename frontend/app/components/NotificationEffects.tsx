"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  // Short, layered UI chime; synthesized locally so no external audio asset is required.
  const notes = kind === "error"
    ? [{ frequency: 392, offset: 0, duration: 0.16 }, { frequency: 311, offset: 0.13, duration: 0.2 }, { frequency: 247, offset: 0.28, duration: 0.24 }]
    : [{ frequency: 523.25, offset: 0, duration: 0.15 }, { frequency: 659.25, offset: 0.09, duration: 0.18 }, { frequency: 783.99, offset: 0.19, duration: 0.26 }];
  notes.forEach(({ frequency, offset, duration }, index) => {
    const at = audio.currentTime + offset;
    const oscillator = audio.createOscillator();
    const overtone = audio.createOscillator();
    const gain = audio.createGain();
    const overtoneGain = audio.createGain();
    oscillator.type = "sine";
    overtone.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, at);
    overtone.frequency.setValueAtTime(frequency * 2.01, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(kind === "error" ? 0.022 : 0.026, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    overtoneGain.gain.setValueAtTime(0.0001, at);
    overtoneGain.gain.exponentialRampToValueAtTime(0.006, at + 0.025);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.8);
    oscillator.connect(gain); gain.connect(audio.destination);
    overtone.connect(overtoneGain); overtoneGain.connect(audio.destination);
    oscillator.start(at); overtone.start(at);
    oscillator.stop(at + duration + 0.02); overtone.stop(at + duration + 0.02);
  });
}

export default function NotificationEffects() {
  const pathname = usePathname();
  const [mode, setMode] = useState<AnimationMode>("cinematic");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsMounted, setNotificationsMounted] = useState(false);
  const [items, setItems] = useState<ToastItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [dockHidden, setDockHidden] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [canManageGmail, setCanManageGmail] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"appearance" | "integrations">("appearance");
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsPanelRef = useRef<HTMLDivElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (settingsOpen) {
      setSettingsMounted(true);
      return;
    }
    if (!settingsMounted) return;
    const closeTimer = window.setTimeout(() => setSettingsMounted(false), 190);
    return () => window.clearTimeout(closeTimer);
  }, [settingsOpen, settingsMounted]);

  useEffect(() => {
    if (notificationsOpen) {
      setNotificationsMounted(true);
      return;
    }
    if (!notificationsMounted) return;
    const closeTimer = window.setTimeout(() => setNotificationsMounted(false), 190);
    return () => window.clearTimeout(closeTimer);
  }, [notificationsOpen, notificationsMounted]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notificationsPanelRef.current?.contains(target) || notificationsButtonRef.current?.contains(target)) return;
      setNotificationsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsPanelRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

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

  // Gmail Integration is a focused standalone workspace; suppress the global floating dock and toast UI there.
  if (pathname?.startsWith("/integrations/google-gmail")) return null;

  return (
    <>
      {false && <></>}

      <div className="pointer-events-none fixed bottom-[5.25rem] right-5 z-[99] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2.5">
        {items.slice(0, 3).map(item => <div key={item.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/15 bg-[#080d1c]/90 p-3.5 text-white shadow-[0_18px_50px_-18px_rgba(2,6,23,.8)] backdrop-blur-2xl animate-in slide-in-from-right-4 fade-in zoom-in-95 duration-300"><span className={`mt-0.5 rounded-lg p-2 ${item.kind === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{item.kind === "success" ? <CheckCircle2 size={17} /> : <X size={17} />}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{item.kind === "success" ? "Success" : "Needs attention"}</p><p className="mt-0.5 break-words text-xs font-semibold leading-5 text-white">{item.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setItems(current => current.filter(x => x.id !== item.id))} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"><X size={14} /></button></div>)}
      </div>
    </>
  );
}
