/**
 * Sound effects synthesised with the Web Audio API — zero asset files needed.
 * Works on desktop, Electron and Capacitor Android WebView.
 *
 * Every cue also fires a matching haptic pulse so the app feels native on
 * Android (see ./haptics — it has its own on/off switch).
 */

import { haptics } from "./haptics";



let ctx: AudioContext | null = null;
let enabled = true;

const KEY = "stock-manager-sfx-enabled";

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "0") enabled = false;
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq: number, duration = 0.08, type: OscillatorType = "sine", gain = 0.15) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + duration + 0.02);
}

export const sfx = {
  setEnabled(v: boolean) {
    enabled = v;
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  },
  isEnabled() {
    return enabled;
  },
  click: () => {
    haptics.light();
    beep(880, 0.04, "square", 0.06);
  },
  tap: () => {
    haptics.medium();
    beep(660, 0.05, "triangle", 0.08);
  },
  scan: () => {
    haptics.scan();
    beep(1500, 0.06, "square", 0.14);
    setTimeout(() => beep(2000, 0.05, "square", 0.12), 40);
  },
  success: () => {
    haptics.success();
    beep(660, 0.08, "sine", 0.14);
    setTimeout(() => beep(880, 0.1, "sine", 0.14), 90);
    setTimeout(() => beep(1320, 0.14, "sine", 0.14), 200);
  },
  error: () => {
    haptics.error();
    beep(220, 0.12, "sawtooth", 0.18);
    setTimeout(() => beep(160, 0.16, "sawtooth", 0.18), 120);
  },
  cash: () => {
    haptics.success();
    beep(1200, 0.05, "triangle", 0.12);
    setTimeout(() => beep(900, 0.06, "triangle", 0.12), 60);
    setTimeout(() => beep(1500, 0.09, "triangle", 0.12), 150);
  },
  warn: () => {
    haptics.warn();
    beep(500, 0.15, "square", 0.14);
  },
};
