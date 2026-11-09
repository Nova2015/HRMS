"use client";

import { useEffect } from "react";

type SoundWindow = Window & { __hrmsAudioContext?: AudioContext; __hrmsAudioReady?: boolean };

function prepareAudio() {
  if (typeof window === "undefined") return;
  const audioWindow = window as SoundWindow;
  if (audioWindow.__hrmsAudioReady) return;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  try {
    const context = audioWindow.__hrmsAudioContext || new AudioContextClass();
    audioWindow.__hrmsAudioContext = context;
    void context.resume();
    audioWindow.__hrmsAudioReady = true;
  } catch {
    // Browser audio may be unavailable; visual notifications still work.
  }
}

function playNotificationSound(kind: "success" | "error") {
  const audioWindow = window as SoundWindow;
  const context = audioWindow.__hrmsAudioContext;
  if (!context || context.state !== "running") return;

  const notes = kind === "error" ? [330, 247] : [660, 880];
  const start = context.currentTime;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.12;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.055, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.17);
  });
}

export default function NotificationEffects() {
  useEffect(() => {
    const unlock = () => prepareAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const recentlyPlayed = new WeakSet<Element>();
    const announce = (element: Element | null) => {
      if (!element || recentlyPlayed.has(element)) return;
      const role = element.getAttribute("role");
      if (role !== "status" && role !== "alert") return;
      const message = element.textContent?.trim();
      if (!message) return;
      recentlyPlayed.add(element);
      playNotificationSound(role === "alert" ? "error" : "success");
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element
          ? mutation.target
          : mutation.target.parentElement;
        announce(target?.closest('[role="status"], [role="alert"]') || null);
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          announce(node.matches('[role="status"], [role="alert"]') ? node : node.querySelector('[role="status"], [role="alert"]'));
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["role"] });

    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
