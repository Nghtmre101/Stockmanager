/**
 * Haptic feedback — makes the POS feel like a real cash register on Android.
 *
 * Uses the Vibration API, which the Capacitor/Android WebView supports out of
 * the box (no extra plugin, no permission prompt on modern Android). Desktop
 * browsers simply ignore it.
 */

const KEY = "stock-manager-haptics-enabled";

let enabled = true;

if (typeof window !== "undefined") {
  try {
    if (localStorage.getItem(KEY) === "0") enabled = false;
  } catch {
    /* ignore */
  }
}

function canVibrate(): boolean {
  return (
    enabled &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

function buzz(pattern: number | number[]) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const haptics = {
  setEnabled(v: boolean) {
    enabled = v;
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (v) buzz(12);
  },
  isEnabled() {
    return enabled;
  },
  /** Light tick for normal taps and navigation. */
  light: () => buzz(8),
  /** Slightly firmer tap for primary actions. */
  medium: () => buzz(16),
  /** Two short pulses — barcode captured. */
  scan: () => buzz([10, 40, 10]),
  /** Rising confirmation — sale finished, cash taken. */
  success: () => buzz([14, 50, 24]),
  /** Long buzz — something went wrong. */
  error: () => buzz([40, 60, 40]),
  /** Soft warning. */
  warn: () => buzz(28),
};
