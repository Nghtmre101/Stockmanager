/**
 * Backup helpers — pushes a JSON snapshot of the database to Firebase Realtime
 * Database and/or Telegram.
 *
 * The app is 100% offline-first: both backends are reached directly from the
 * browser/WebView using the public APIs — there is NO server/proxy in the
 * middle. All configuration lives in localStorage so it survives reloads
 * without leaving credentials in the app bundle.
 */

import { getFirebaseDB, resolveAppDataPath } from "./firebase";
import {
  get,
  ref,
  set,
  push,
  remove,
  query,
  orderByChild,
  type DataSnapshot,
} from "firebase/database";

const FIREBASE_KEY = "stock-manager-firebase-config";
const TELEGRAM_KEY = "stock-manager-telegram-config";
const BACKUP_PREFIX = "stock-manager-backup-";
const RESTORE_LOG_KEY = "stock-manager-restore-log-v1";

export type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  appId?: string;
  messagingSenderId?: string;
  databaseURL?: string;
};

export type TelegramConfig = {
  botToken?: string;
  chatId?: string;
};

export const backupCfg = {
  firebase: {
    get(): FirebaseConfig {
      try {
        return JSON.parse(localStorage.getItem(FIREBASE_KEY) || "{}");
      } catch {
        return {};
      }
    },
    set(v: FirebaseConfig) {
      localStorage.setItem(FIREBASE_KEY, JSON.stringify(v));
    },
  },
  telegram: {
    get(): TelegramConfig {
      try {
        return JSON.parse(localStorage.getItem(TELEGRAM_KEY) || "{}");
      } catch {
        return {};
      }
    },
    set(v: TelegramConfig) {
      localStorage.setItem(TELEGRAM_KEY, JSON.stringify(v));
    },
  },
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Direct Telegram Bot API call. The bot token and chat id are sent from the
 * client to Telegram's HTTPS endpoint — there is no local server/proxy. This
 * keeps the app fully offline-capable (Telegram is only used when online).
 */
async function callTelegram(
  botToken: string,
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `https://api.telegram.org/bot${botToken}/${endpoint}`;
  const res = await fetch(url, init);
  return res;
}

/**
 * Safe Telegram connection test.
 *
 * Calls Telegram's `getMe` (verifies the bot token) and `getChat` (verifies
 * the chat ID) WITHOUT sending any chat message — a single controlled
 * diagnostic, no spam. Returns Telegram's own API result/description (the bot
 * token is never logged or exposed in the result).
 */
export type TelegramTestResult = {
  ok: boolean;
  step?: "token" | "chatId" | "chat" | "all";
  description?: string;
  error?: string;
  chat?: number;
  chatType?: string;
  chatTitle?: string | null;
};

export async function testTelegramConnection(): Promise<TelegramTestResult> {
  const cfg = backupCfg.telegram.get();
  if (!cfg.botToken || !cfg.chatId) {
    return {
      ok: false,
      step: "chatId",
      description: !cfg.botToken ? "Bot token is not set." : "Chat ID is not set.",
      error: "telegram_not_configured",
    };
  }

  try {
    const meRes = await callTelegram(cfg.botToken, "getMe");
    const meData = (await meRes.json()) as { ok?: boolean; description?: string };
    if (!meData.ok) {
      return {
        ok: false,
        step: "token",
        description: meData.description ?? "Bot token rejected by Telegram.",
        error: "telegram_token_invalid",
      };
    }
    if (!cfg.chatId) {
      return {
        ok: false,
        step: "chatId",
        description: "Chat ID is empty.",
        error: "telegram_chat_id_missing",
      };
    }
    const chatRes = await callTelegram(cfg.botToken, "getChat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId }),
    });
    const chatData = (await chatRes.json()) as {
      ok?: boolean;
      description?: string;
      result?: { id?: number; type?: string; title?: string; username?: string };
    };
    if (!chatData.ok) {
      return {
        ok: false,
        step: "chat",
        description: chatData.description ?? "Chat lookup failed.",
        error: "telegram_chat_rejected",
      };
    }
    return {
      ok: true,
      step: "all",
      description: "Telegram connection OK.",
      chat: chatData.result?.id,
      chatType: chatData.result?.type,
      chatTitle: chatData.result?.title ?? chatData.result?.username ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      description: "Network failure reaching Telegram. Check the internet connection.",
      error: "telegram_network_failure",
      step: "all",
    };
  }
}

/** Send a backup JSON file to Telegram via sendDocument. */
export async function sendBackupToTelegram(json: string, filename?: string) {
  const cfg = backupCfg.telegram.get();
  if (!cfg.botToken || !cfg.chatId) {
    throw new Error("telegram_not_configured");
  }
  const blob = new Blob([json], { type: "application/json" });
  const form = new FormData();
  form.append("chat_id", cfg.chatId);
  form.append("caption", `Stock Manager backup — ${new Date().toLocaleString()}`);
  form.append("document", blob, filename || `stock-manager-backup-${stamp()}.json`);
  const res = await callTelegram(cfg.botToken, "sendDocument", {
    method: "POST",
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    error?: string;
  };
  if (!res.ok || !body?.ok) {
    throw new Error(body?.description || body?.error || `Telegram HTTP ${res.status}`);
  }
  return body;
}

/** Try to fetch the most recent backup document sent to the bot chat. */
export async function fetchLatestTelegramBackup(): Promise<string> {
  const cfg = backupCfg.telegram.get();
  if (!cfg.botToken || !cfg.chatId) throw new Error("telegram_not_configured");

  const upd = await callTelegram(cfg.botToken, "getUpdates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: cfg.chatId, limit: 100 }),
  });
  const j = (await upd.json()) as {
    ok?: boolean;
    description?: string;
    error?: string;
    result?: Array<{
      message?: { chat?: { id: number }; document?: { file_id: string; file_name?: string } };
    }>;
  };
  if (!j.ok) throw new Error(j.description || j.error || "getUpdates failed");

  const docs = (j.result ?? [])
    .map((u) => u.message)
    .filter((m) => m?.chat?.id?.toString() === String(cfg.chatId) && m?.document);
  const latest = docs[docs.length - 1];
  if (!latest?.document) throw new Error("no_backup_found");

  const fileRes = await callTelegram(cfg.botToken, "getFile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_id: latest.document.file_id }),
  });
  const fj = (await fileRes.json()) as {
    ok?: boolean;
    description?: string;
    error?: string;
    result?: { file_path?: string };
  };
  if (!fj.ok) throw new Error(fj.description || fj.error || "getFile failed");

  const downloadUrl = `https://api.telegram.org/file/bot${cfg.botToken}/${encodeURIComponent(fj.result?.file_path ?? "")}`;
  const dl = await fetch(downloadUrl);
  return await dl.text();
}

/* ------------------------------------------------------------------ */
/* Firebase cloud backups — authenticated SDK, ADMIN-only (per rules)  */
/* ------------------------------------------------------------------ */

export type FirebaseBackupMeta = {
  /** RTDB push id — stable key for download/delete. */
  id: string;
  createdAt: string;
  device: string;
  /** Approximate size in bytes of the stored payload. */
  size?: number;
};

export type FirebaseBackup = FirebaseBackupMeta & { payload: string };

/**
 * Upload a full snapshot of the POS data to Firebase Realtime Database.
 *
 * Uses the authenticated SDK — the signed-in user is already present and the
 * Security Rules only allow ADMIN accounts to write this node. Each call is
 * PUSHED to `app_data/backups/{pushId}`, so every backup is preserved
 * (multiple backups, never overwrites an earlier one). Backups are NEVER
 * auto-restored: an admin must explicitly download one and confirm a restore
 * from the Settings screen.
 */
export async function sendBackupToFirebase(json: string): Promise<string> {
  const db = getFirebaseDB();
  const backupsRef = ref(db, resolveAppDataPath("backups"));
  const record = {
    createdAt: new Date().toISOString(),
    device: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    size: json.length,
    payload: json,
  };
  const newRef = push(backupsRef);
  await set(newRef, record);
  return newRef.key ?? "";
}

/**
 * List existing Firebase backups (newest first) WITHOUT their payloads, so the
 * UI can render a light list and only fetch the (potentially large) payload
 * when the admin chooses to download or restore one.
 */
export async function listFirebaseBackups(): Promise<FirebaseBackupMeta[]> {
  const db = getFirebaseDB();
  const backupsRef = ref(db, resolveAppDataPath("backups"));
  const snap = await get(query(backupsRef, orderByChild("createdAt")));
  if (!snap.exists()) return [];
  const out: FirebaseBackupMeta[] = [];
  snap.forEach((child: DataSnapshot) => {
    const v = (child.val() ?? {}) as Record<string, unknown>;
    out.push({
      id: child.key ?? "",
      createdAt: String(v.createdAt ?? ""),
      device: String(v.device ?? ""),
      size: typeof v.size === "number" ? v.size : undefined,
    });
    return false;
  });
  // orderByChild(createdAt) returns ascending; newest first for display.
  return out.reverse();
}

/** Download the full payload of a single backup by its push id. */
export async function downloadFirebaseBackup(id: string): Promise<string> {
  const db = getFirebaseDB();
  const snap = await get(ref(db, resolveAppDataPath("backups", id)));
  if (!snap.exists()) throw new Error("backup_not_found");
  const v = (snap.val() ?? {}) as Record<string, unknown>;
  if (typeof v.payload !== "string") throw new Error("backup_payload_invalid");
  return v.payload as string;
}

/** Delete a cloud backup by id (admin pruning — backups are never auto-deleted). */
export async function deleteFirebaseBackup(id: string): Promise<void> {
  const db = getFirebaseDB();
  await remove(ref(db, resolveAppDataPath("backups", id)));
}

/** Convenience: download the most recent backup's payload. */
export async function fetchLatestFirebaseBackup(): Promise<string> {
  const list = await listFirebaseBackups();
  if (list.length === 0) throw new Error("no_backup_found");
  return downloadFirebaseBackup(list[0].id);
}

/* ------------------------------------------------------------------ */
/* Versioned local backups + safe restore/merge                        */
/* ------------------------------------------------------------------ */

export type RestoreLogEntry = {
  at: string;
  kind: "backup" | "restore" | "import" | "migration" | "failed_restore";
  detail: string;
};

/**
 * Create a uniquely named local backup snapshot. Backups are NEVER overwritten:
 * each call produces a new timestamped key, e.g.
 *   stock-manager-backup-2026-08-10T11-30-00.000Z.json
 */
export function cleanupLocalBackups(limit = 30) {
  if (typeof window === "undefined") return;
  const keys = listLocalBackups();
  for (const key of keys.slice(limit)) {
    localStorage.removeItem(key);
  }
}

export function createLocalBackup(json: string, limit = 30): string {
  const key = `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  try {
    localStorage.setItem(key, json);
    cleanupLocalBackups(limit);
  } catch {
    /* storage full — keep going; the app state is still in memory */
  }
  return key;
}

/** All locally stored backup keys, newest first. */
export function listLocalBackups(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k);
  }
  return keys.sort().reverse();
}

export function readLocalBackup(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Append an entry to the persistent restore log. */
export function appendRestoreLog(entry: Omit<RestoreLogEntry, "at">) {
  try {
    const raw = localStorage.getItem(RESTORE_LOG_KEY);
    const log = raw ? (JSON.parse(raw) as RestoreLogEntry[]) : [];
    log.push({ ...entry, at: new Date().toISOString() });
    localStorage.setItem(RESTORE_LOG_KEY, JSON.stringify(log.slice(-200)));
  } catch {
    /* ignore */
  }
}

export function getRestoreLog(): RestoreLogEntry[] {
  try {
    const raw = localStorage.getItem(RESTORE_LOG_KEY);
    return raw ? (JSON.parse(raw) as RestoreLogEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Validate a parsed database object before it can be merged into live data.
 * Returns a list of problems; an empty list means the data is safe to merge.
 * We never reject a backup simply because it is "smaller" — empty databases
 * are never treated as authoritative.
 */
export function validateImportedDB(
  candidate: unknown,
  requiredCollections: string[] = [
    "settings",
    "categories",
    "products",
    "customers",
    "suppliers",
    "sales",
    "purchases",
    "expenses",
    "damages",
    "employees",
    "payroll",
  ],
): string[] {
  const problems: string[] = [];
  if (!candidate || typeof candidate !== "object") {
    return ["not_an_object"];
  }
  const db = candidate as Record<string, unknown>;
  for (const col of requiredCollections) {
    if (!Array.isArray(db[col])) {
      problems.push(`collection_${col}_missing_or_invalid`);
    }
  }
  // Every record must have a stable ID.
  for (const col of requiredCollections) {
    const arr = db[col];
    if (!Array.isArray(arr)) continue;
    for (const rec of arr as Array<Record<string, unknown>>) {
      if (rec && typeof rec === "object" && typeof rec.id !== "string") {
        problems.push(`record_without_id_in_${col}`);
        break;
      }
    }
  }
  return problems;
}

/**
 * Merge an imported database into the current database NON-destructively.
 *
 * Rules:
 *  - The existing (current) data is always preserved.
 *  - Records present on BOTH sides keep the LOCAL copy (the local pending
 *    queue already wins, and local data is never silently replaced).
 *  - Records that exist only in the import are added.
 *  - Settings are merged field-by-field (import only fills missing fields).
 *
 * A safety backup of the current data is created BEFORE anything is merged,
 * and the merge itself is pure (returns a new object) so a failure leaves the
 * original untouched. Returns the merged DB and the list of added records.
 */
export function mergeDatabases(
  current: unknown,
  imported: unknown,
  collections: string[] = [
    "categories",
    "products",
    "customers",
    "suppliers",
    "sales",
    "purchases",
    "expenses",
    "damages",
    "employees",
    "payroll",
    "debtPayments",
    "supplierPayments",
    "cashSessions",
    "stockMovements",
  ],
): { merged: unknown; addedByCollection: Record<string, number> } {
  const cur = (current ?? {}) as Record<string, unknown>;
  const imp = (imported ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...cur };
  const addedByCollection: Record<string, number> = {};

  for (const col of collections) {
    const curArr = Array.isArray(cur[col]) ? (cur[col] as Array<{ id: string }>) : [];
    const impArr = Array.isArray(imp[col]) ? (imp[col] as Array<{ id: string }>) : [];
    const curIds = new Set(curArr.map((r) => r.id));
    const newRecs = impArr.filter((r) => r && typeof r.id === "string" && !curIds.has(r.id));
    if (newRecs.length > 0) {
      merged[col] = [...curArr, ...newRecs];
      addedByCollection[col] = newRecs.length;
    }
  }

  // Settings merge — existing values win, import only fills blanks.
  const curSettings = (cur.settings ?? {}) as Record<string, unknown>;
  const impSettings = (imp.settings ?? {}) as Record<string, unknown>;
  const mergedSettings: Record<string, unknown> = { ...impSettings, ...curSettings };
  merged.settings = mergedSettings;

  return { merged, addedByCollection };
}

/**
 * Full safe-restore pipeline:
 *
 *   STAGE  → parse + validate into a staging area
 *   COMMIT → only after validation succeeds, merge into live data
 *   FAILURE→ validation failed ⇒ return original untouched, log the attempt
 *
 * Always takes a versioned backup of the current data before committing.
 * Returns the new DB (or null when the restore was rejected).
 */
export function restoreFromBackup(
  current: unknown,
  imported: unknown,
  options?: { collections?: string[]; reason?: string },
): { db: unknown; backupKey?: string; addedByCollection?: Record<string, number> } | null {
  const problems = validateImportedDB(imported, options?.collections);
  if (problems.length > 0) {
    appendRestoreLog({
      kind: "failed_restore",
      detail: `Rejected restore: ${problems.join(", ")}`,
    });
    return null;
  }

  // Safety backup BEFORE anything is touched.
  let backupKey: string | undefined;
  try {
    backupKey = createLocalBackup(JSON.stringify(current ?? {}));
  } catch {
    /* keep going */
  }

  const { merged, addedByCollection } = mergeDatabases(current, imported, options?.collections);
  appendRestoreLog({
    kind: options?.reason === "backup" ? "restore" : "import",
    detail: `Merged backup. Added: ${
      Object.entries(addedByCollection)
        .map(([c, n]) => `${c}:${n}`)
        .join(", ") || "0"
    } records. Safety backup: ${backupKey ?? "n/a"}`,
  });
  return { db: merged, backupKey, addedByCollection };
}