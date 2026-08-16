/**
 * Barcode scanner helpers.
 *
 * - Desktop / Electron: USB HID scanners appear to the OS as a keyboard. This
 *   module attaches a global listener that captures fast key sequences
 *   terminating in Enter, without disturbing normal typing in inputs.
 *
 * - Android (Capacitor): uses the `@capacitor-mlkit/barcode-scanning` native
 *   plugin, which opens the device camera in a reliable Google-MLKit powered
 *   overlay and returns the decoded value. This is the recommended path on
 *   Android because the Web `BarcodeDetector` API is not available in the
 *   Android WebView.
 *
 * - Web / fallback: uses the built-in `BarcodeDetector` Web API with a live
 *   camera preview. Falls back to manual entry if neither is present.
 */

import { Capacitor } from "@capacitor/core";
import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";
import { sfx } from "./sfx";

type Listener = (code: string) => void;
const listeners = new Set<Listener>();

let buffer = "";
let lastKeyAt = 0;
let attached = false;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

function handleKey(e: KeyboardEvent) {
  const now = Date.now();
  const gap = now - lastKeyAt;
  lastKeyAt = now;

  // Reset buffer if the user has been idle — anything faster than 60ms per
  // key is almost certainly the scanner.
  if (gap > 500) buffer = "";

  if (e.key === "Enter") {
    if (buffer.length >= 4) {
      const code = buffer;
      buffer = "";
      if (!isTypingTarget(e.target)) e.preventDefault();
      sfx.scan();
      listeners.forEach((fn) => {
        try {
          fn(code);
        } catch {
          /* ignore listener errors */
        }
      });
    } else {
      buffer = "";
    }
    return;
  }

  if (e.key.length === 1) {
    buffer += e.key;
    // Keep buffer bounded
    if (buffer.length > 64) buffer = buffer.slice(-64);
  } else {
    // modifier / arrow — ignore
  }
}

export function attachGlobalScanner() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("keydown", handleKey, true);
}

export function onScan(fn: Listener) {
  attachGlobalScanner();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------ camera scan */

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

export function hasCameraScanner(): boolean {
  if (typeof window === "undefined") return false;
  return "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

export type CameraScanHandle = {
  video: HTMLVideoElement;
  stop: () => void;
};

/**
 * Attach a live camera preview to `video` and call `onCode` whenever a
 * barcode is detected. Requires HTTPS in the browser and CAMERA permission
 * on Android. Automatically stops on `handle.stop()`.
 */
export async function startCameraScan(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<CameraScanHandle> {
  if (!hasCameraScanner()) {
    throw new Error("BarcodeDetector API is not available on this device.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  await video.play();

  const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
  const detector = new Ctor({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"],
  });

  let stopped = false;
  const seen = new Map<string, number>();

  const tick = async () => {
    if (stopped) return;
    try {
      const results = await detector.detect(video);
      for (const r of results) {
        const now = Date.now();
        const last = seen.get(r.rawValue) ?? 0;
        if (now - last > 1500) {
          seen.set(r.rawValue, now);
          sfx.scan();
          onCode(r.rawValue);
        }
      }
    } catch {
      /* frame skipped */
    }
    if (!stopped) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    video,
    stop: () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/**
 * Convenience wrapper: opens a fullscreen camera overlay, resolves with
 * the first successfully scanned barcode, then tears everything down.
 * Rejects on user cancel or camera error.
 */
export function isCameraScanAvailable(): boolean {
  return hasCameraScanner();
}

export async function scanBarcodeFromCamera(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;";
    const video = document.createElement("video");
    video.style.cssText = "max-width:100%;max-height:70vh;border-radius:16px;";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Cancel";
    closeBtn.style.cssText =
      "background:#fff;color:#000;border-radius:9999px;padding:8px 20px;font-weight:800;";
    overlay.append(video, closeBtn);
    document.body.appendChild(overlay);

    let handle: CameraScanHandle | null = null;
    const cleanup = () => {
      handle?.stop();
      overlay.remove();
    };
    closeBtn.onclick = () => {
      cleanup();
      reject(new Error("cancelled"));
    };

    startCameraScan(video, (code) => {
      cleanup();
      resolve(code);
    }).then((h) => {
      handle = h;
    }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

/* ----------------------------------------------- unified scan entry point */

const NATIVE_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.QrCode,
  BarcodeFormat.Itf,
];

/** True when a reliable native (Android) camera scanner is present. */
export function isNativeScanAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BarcodeScanner")
  );
}

/**
 * True when scanning is possible at all: either the native Android plugin or
 * the web `BarcodeDetector` camera path is available.
 */
export function isScanAvailable(): boolean {
  return isNativeScanAvailable() || hasCameraScanner();
}

/**
 * Unified scan entry point used by the POS "Scan" button.
 *
 * On Android (Capacitor native) this opens the device camera via the MLKit
 * plugin and waits for the user to aim at a barcode. Everywhere else it
 * falls back to the web camera overlay. Rejects if the user cancels or the
 * camera is unavailable.
 */
/**
 * Runs the MLKit "Google code scanner" UI. On many devices the scanner module
 * is delivered by Google Play services on demand — if it is missing, `scan()`
 * throws or returns nothing, which is why the button seemed dead even with the
 * camera permission granted. We install the module first and wait for it.
 */
async function ensureGoogleScannerModule(): Promise<boolean> {
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (available) return true;
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    // The install is asynchronous; poll briefly for completion.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (res.available) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fallback native path: the plugin renders the camera preview *behind* the
 * WebView, so we must make the WebView transparent while scanning and restore
 * it afterwards. Provides a cancel button drawn on top of the preview.
 */
async function nativeStartScan(): Promise<string> {
  document.documentElement.classList.add("barcode-scanner-active");
  document.body.classList.add("barcode-scanner-active");

  const ui = document.createElement("div");
  ui.className = "barcode-scanner-ui";
  ui.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:32px;background:transparent;";
  const cancel = document.createElement("button");
  cancel.textContent = "\u2715";
  cancel.setAttribute("aria-label", "Cancel scan");
  cancel.style.cssText =
    "background:#fff;color:#000;border-radius:9999px;padding:12px 24px;font-weight:800;font-size:18px;";
  ui.appendChild(cancel);
  document.body.appendChild(ui);

  return new Promise<string>((resolve, reject) => {
    let done = false;
    const cleanup = async () => {
      document.documentElement.classList.remove("barcode-scanner-active");
      document.body.classList.remove("barcode-scanner-active");
      ui.remove();
      try {
        await BarcodeScanner.removeAllListeners();
        await BarcodeScanner.stopScan();
      } catch {
        /* already stopped */
      }
    };

    cancel.onclick = async () => {
      if (done) return;
      done = true;
      await cleanup();
      reject(new Error("cancelled"));
    };

    BarcodeScanner.addListener("barcodesScanned", async (event) => {
      if (done) return;
      const value = event.barcodes?.[0]?.rawValue;
      if (!value) return;
      done = true;
      await cleanup();
      sfx.scan();
      resolve(value);
    })
      .then(() => BarcodeScanner.startScan({ formats: NATIVE_FORMATS }))
      .catch(async (err) => {
        if (done) return;
        done = true;
        await cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

export async function scanBarcode(): Promise<string> {
  if (isNativeScanAvailable()) {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) throw new Error("Barcode scanning is not supported on this device.");

    // Camera permission: request only when not already granted, and surface a
    // catchable error when denied instead of failing silently.
    const current = await BarcodeScanner.checkPermissions();
    if (current.camera !== "granted") {
      const requested = await BarcodeScanner.requestPermissions();
      if (requested.camera !== "granted") {
        throw new Error("camera-permission-denied");
      }
    }

    // Preferred path: Google code scanner UI (no WebView transparency needed).
    if (await ensureGoogleScannerModule()) {
      try {
        const { barcodes } = await BarcodeScanner.scan({ formats: NATIVE_FORMATS });
        const code = barcodes?.[0]?.rawValue;
        if (code) {
          sfx.scan();
          return code;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/cancel/i.test(msg)) throw new Error("cancelled");
        // fall through to the in-WebView scanner below
      }
    }

    // Fallback: in-app native preview behind a transparent WebView.
    return nativeStartScan();
  }
  // Web / desktop fallback: camera overlay via BarcodeDetector.
  return scanBarcodeFromCamera();
}

/* ------------------------------------------------------------------ */
/* Continuous scan session (always-open scanner + live counter)        */
/* ------------------------------------------------------------------ */

export type ScanSession = {
  /** Close the scanner and release the camera. */
  stop: () => void;
  /** Show live feedback for the last scanned item (product name / error). */
  report: (label: string, ok?: boolean) => void;
};

type OverlayUI = {
  root: HTMLDivElement;
  video: HTMLVideoElement;
  setCount: (n: number) => void;
  setLast: (label: string, ok: boolean) => void;
  destroy: () => void;
};

function buildScanOverlay(opts: {
  transparent: boolean;
  title: string;
  onClose: () => void;
}): OverlayUI {
  const root = document.createElement("div");
  root.className = "barcode-scanner-ui";
  root.style.cssText = `position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;justify-content:space-between;background:${
    opts.transparent ? "transparent" : "#000"
  };font-family:inherit;`;

  /* top bar: title + live counter */
  const top = document.createElement("div");
  top.style.cssText =
    "display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top) + 14px) 16px 14px;background:rgba(0,0,0,.72);color:#fff;";
  const title = document.createElement("div");
  title.textContent = opts.title;
  title.style.cssText = "flex:1;font-weight:800;font-size:15px;";
  const counter = document.createElement("div");
  counter.style.cssText =
    "min-width:44px;text-align:center;background:#fff;color:#000;border-radius:9999px;padding:6px 14px;font-weight:900;font-size:16px;";
  counter.textContent = "0";
  top.append(title, counter);

  /* live camera preview (web path only — native draws behind the WebView) */
  const middle = document.createElement("div");
  middle.style.cssText =
    "position:relative;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;";
  const video = document.createElement("video");
  video.muted = true;
  video.setAttribute("playsinline", "true");
  video.style.cssText = opts.transparent
    ? "display:none;"
    : "width:100%;height:100%;object-fit:cover;";
  const frame = document.createElement("div");
  frame.style.cssText =
    "position:absolute;left:12%;right:12%;top:30%;height:26%;border:3px solid rgba(255,255,255,.9);border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.25);";
  middle.append(video, frame);

  /* bottom bar: last scanned item + close button */
  const bottom = document.createElement("div");
  bottom.style.cssText =
    "display:flex;flex-direction:column;gap:12px;padding:16px 16px calc(env(safe-area-inset-bottom) + 20px);background:rgba(0,0,0,.72);color:#fff;";
  const last = document.createElement("div");
  last.style.cssText =
    "min-height:22px;font-weight:800;font-size:14px;text-align:center;opacity:.9;";
  last.textContent = "";
  const close = document.createElement("button");
  close.textContent = "\u2715";
  close.setAttribute("aria-label", "Close scanner");
  close.style.cssText =
    "align-self:center;background:#fff;color:#000;border:0;border-radius:9999px;padding:12px 34px;font-weight:900;font-size:18px;";
  close.onclick = opts.onClose;
  bottom.append(last, close);

  root.append(top, middle, bottom);
  document.body.appendChild(root);

  return {
    root,
    video,
    setCount: (n) => {
      counter.textContent = String(n);
      counter.animate?.(
        [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
        { duration: 220 },
      );
    },
    setLast: (label, ok) => {
      last.textContent = label;
      last.style.color = ok ? "#7CFFB2" : "#FF9A9A";
    },
    destroy: () => root.remove(),
  };
}

/**
 * Opens the camera and KEEPS IT OPEN, streaming every decoded barcode to
 * `onCode` until the user closes it. Shows a live counter of scanned items and
 * the last item's label. Works on Android (MLKit native preview behind a
 * transparent WebView) and on web/desktop (BarcodeDetector + <video>).
 */
export async function startScanSession(opts: {
  onCode: (code: string) => void;
  title?: string;
  onClose?: () => void;
}): Promise<ScanSession> {
  const title = opts.title ?? "Scanning…";
  let count = 0;
  let closed = false;
  const seen = new Map<string, number>();

  const accept = (code: string) => {
    const now = Date.now();
    const prev = seen.get(code) ?? 0;
    if (now - prev < 1200) return false;
    seen.set(code, now);
    count += 1;
    return true;
  };

  if (isNativeScanAvailable()) {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) throw new Error("Barcode scanning is not supported on this device.");
    const current = await BarcodeScanner.checkPermissions();
    if (current.camera !== "granted") {
      const requested = await BarcodeScanner.requestPermissions();
      if (requested.camera !== "granted") throw new Error("camera-permission-denied");
    }

    document.documentElement.classList.add("barcode-scanner-active");
    document.body.classList.add("barcode-scanner-active");

    let ui: OverlayUI | null = null;
    const stop = () => {
      if (closed) return;
      closed = true;
      document.documentElement.classList.remove("barcode-scanner-active");
      document.body.classList.remove("barcode-scanner-active");
      ui?.destroy();
      void BarcodeScanner.removeAllListeners().catch(() => {});
      void BarcodeScanner.stopScan().catch(() => {});
      opts.onClose?.();
    };

    ui = buildScanOverlay({ transparent: true, title, onClose: stop });

    await BarcodeScanner.removeAllListeners().catch(() => {});
    await BarcodeScanner.addListener("barcodesScanned", (event) => {
      if (closed) return;
      for (const b of event.barcodes ?? []) {
        const value = b.rawValue;
        if (!value || !accept(value)) continue;
        sfx.scan();
        ui?.setCount(count);
        opts.onCode(value);
      }
    });
    await BarcodeScanner.startScan({ formats: NATIVE_FORMATS });

    return {
      stop,
      report: (label, ok = true) => ui?.setLast(label, ok),
    };
  }

  /* Web / desktop: live <video> preview with BarcodeDetector. */
  if (!hasCameraScanner()) throw new Error("no-camera-scanner");

  let handle: CameraScanHandle | null = null;
  let ui: OverlayUI | null = null;
  const stop = () => {
    if (closed) return;
    closed = true;
    handle?.stop();
    ui?.destroy();
    opts.onClose?.();
  };
  ui = buildScanOverlay({ transparent: false, title, onClose: stop });

  try {
    handle = await startCameraScan(ui.video, (code) => {
      if (closed || !accept(code)) return;
      ui?.setCount(count);
      opts.onCode(code);
    });
  } catch (err) {
    stop();
    throw err;
  }

  return {
    stop,
    report: (label, ok = true) => ui?.setLast(label, ok),
  };
}
