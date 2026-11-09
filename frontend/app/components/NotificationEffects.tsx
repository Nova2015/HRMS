"use client";

import { useEffect } from "react";

type SoundWindow = Window & { __hrmsAudioContext?: AudioContext; __hrmsAudioReady?: boolean };

function prepareAudio() {
  const audioWindow = window as SoundWindow;
  if (audioWindow.__hrmsAudioReady) return;
  if (!window.AudioContext) return;
  try {
    const context = audioWindow.__hrmsAudioContext || new window.AudioContext();
    audioWindow.__hrmsAudioContext = context;
    void context.resume();
    audioWindow.__hrmsAudioReady = true;
  } catch {
    // Keep visual notifications available if browser audio is unsupported.
  }
}

function playNotificationSound(kind: "success" | "error") {
  const context = (window as SoundWindow).__hrmsAudioContext;
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
    gain.gain.exponentialRampToValueAtTime(0.045, at + 0.018);
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
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const lastMessage = new WeakMap<Element, string>();
    const announce = (element: Element | null) => {
      if (!element) return;
      const role = element.getAttribute("role");
      if (role !== "status" && role !== "alert") return;
      const message = element.textContent?.trim() || "";
      if (!message || lastMessage.get(element) === message) return;
      lastMessage.set(element, message);
      playNotificationSound(role === "alert" ? "error" : "success");
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
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
