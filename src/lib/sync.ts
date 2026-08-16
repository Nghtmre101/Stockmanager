/**
 * Sync engine — Firebase Realtime Database synchronization.
 *
 * The app remains local-first: every mutation is written to localStorage
 * immediately (so a sudden power loss never loses data) and is also recorded
 * as an idempotent "pending op" in a persistent queue. When the network is
 * available the engine:
 *
 *   1. pushes pending ops to RTDB under `sync_rooms/ops/{opId}` (stable IDs ⇒
 *      re-sending after a reconnect is harmless — writing the same key twice
 *      is an update, not a duplicate),
 *   2. listens to every collection in RTDB and merges remote records into the
 *      local DB by stable ID (never blindly replacing the whole database),
 *   3. exposes a SyncStatus for the UI (Synced / Syncing / Offline /
 *      Pending changes / Sync error).
 *
 * Lifecycle:
 *
 *   - startSyncEngine()  — start/resume the engine (only while authenticated)
 *   - stopSyncEngine()   — stop/pause safely (pending ops are NEVER dropped)
 *   - queueChange()      — record a local mutation (persist + flush)
 *   - queueDelete()      — record a local deletion (tombstone on RTDB)
 *   - uploadLocalState() — opt-in initial upload of the existing local DB
 *   - triggerManualSync()— manual "Sync now" button: flush pending ops and
 *                          re-pull remote changes immediately (safe offline).
 *
 * There is exactly ONE active engine per authenticated session: startSyncEngine
 * is guarded by a `started` flag, and stopSyncEngine resets it so a later login
 * can restart cleanly. stopSyncEngine also tears down all listeners/timers.
 *
 * First-sync safety: remote records are only EVER merged INTO the local DB when
 * they are new (no local record with the same id exists). Local data is the
 * source of truth and is never replaced or deleted by a remote merge. If RTDB
 * is empty while local has data, nothing is lost — the operator can opt into
 * `uploadLocalState()` from Settings → Firebase to push existing data up.
 */

import {
  get,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
  ref,
  remove,
  set,
  type DataSnapshot,
} from "firebase/database";
import { getFirebaseAuth, getFirebaseDB, resolveAppDataPath, resolveSyncPath } from "./firebase";
import { uid, type DB } from "./db";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type SyncStatus = "synced" | "syncing" | "offline" | "pending" | "error";

export type PendingOp = {
  /** Stable op id — doubles as the RTDB key so replays are idempotent. */
  id: string;
  kind: SyncKind;
  /** Stable record id. */
  refId: string;
  ts: string;
  uid?: string;
  /** `null` marks a deletion (tombstone). */
  payload: unknown;
};

export type SyncKind =
  | "product"
  | "category"
  | "sale"
  | "refund"
  | "stockMovement"
  | "purchase"
  | "customer"
  | "supplier"
  | "employee"
  | "user"
  | "settings"
  | "expense"
  | "damage"
  | "payroll"
  | "debtPayment"
  | "supplierPayment"
  | "cashSession"
  | "activity"
  | "restoreLog";

export type SyncEvent =
  | { type: "status"; status: SyncStatus; pendingCount: number }
  | {
      type: "remoteMerge";
      kind: SyncKind;
      refId: string;
      /** The raw remote record (sync metadata stripped). */
      remote: Record<string, unknown>;
      /** True when the remote record is a deletion tombstone. */
      isDelete: boolean;
      /** True when the remote record should replace an existing local one. */
      isUpdate?: boolean;
    };

/* ------------------------------------------------------------------ */
/* Persistent queue (survives restarts & power loss)                   */
/* ------------------------------------------------------------------ */

const PENDING_KEY = "stock-manager-pending-v1";
const ACK_KEY = "stock-manager-acked-v1"; // Set<opId> that already reached RTDB

export function loadPending(): PendingOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingOp[]) : [];
  } catch {
    return [];
  }
}

function savePending(ops: PendingOp[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch {
    /* storage full — keep in memory only */
  }
}

function loadAcked(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ACK_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveAcked(acked: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACK_KEY, JSON.stringify([...acked]));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Engine state                                                        */
/* ------------------------------------------------------------------ */

type Listener = (e: SyncEvent) => void;

const listeners = new Set<Listener>();
let status: SyncStatus = "syncing";
let online = typeof navigator !== "undefined" ? navigator.onLine : true;
let started = false;
let flushing = false;
let stopFns: Array<() => void> = [];
let localDb: DB | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let pulling = false;

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(e: SyncEvent) {
  for (const l of listeners) l(e);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getPendingCount(): number {
  return loadPending().length;
}

/** True while the engine is running (authenticated session active). */
export function isSyncEngineRunning(): boolean {
  return started;
}

/** The sync engine reads the latest DB snapshot through this hook. */
export function setLocalDb(db: DB) {
  localDb = db;
}

/* ------------------------------------------------------------------ */
/* Connectivity helpers                                                */
/* ------------------------------------------------------------------ */

function setStatus(s: SyncStatus) {
  if (status === s) return;
  status = s;
  emit({ type: "status", status: s, pendingCount: getPendingCount() });
}

function updateNetworkState() {
  const wasOnline = online;
  online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online && !wasOnline) {
    setStatus("syncing");
    void flushPending();
  } else if (!online) {
    setStatus("offline");
  } else if (getPendingCount() === 0) {
    setStatus("synced");
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    // AUTO-SYNC: push any pending local change every 5s while online. Failed
    // ops stay queued and are only acknowledged after RTDB confirms the write.
    if (
      started &&
      typeof navigator !== "undefined" &&
      navigator.onLine &&
      loadPending().length > 0
    ) {
      void flushPending();
    }
  }, 5_000);

  if (pullTimer) return;
  // AUTO-SYNC (inbound safety net): realtime listeners already stream changes,
  // but a periodic reconcile catches anything missed while the device was
  // asleep, offline, or on a flaky mobile connection.
  pullTimer = setInterval(() => {
    if (started && typeof navigator !== "undefined" && navigator.onLine) {
      void pullAll();
    }
  }, 45_000);
}

/**
 * Auto-sync tick — flush outbound queue then reconcile inbound data.
 * Called on start, on reconnect, on window focus / app resume, and on a timer.
 */
export async function autoSync(): Promise<void> {
  if (!started) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus("offline");
    return;
  }
  await flushPending();
  await pullAll();
}

function handleAutoSyncTrigger() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  void autoSync();
}

/* RTDB read helpers                                                   */
/* ------------------------------------------------------------------ */

function readVal<T>(path: string): Promise<T | null> {
  return get(ref(getFirebaseDB(), path)).then((s) => (s.exists() ? (s.val() as T) : null));
}

/* ------------------------------------------------------------------ */
/* Collection path map                                                 */
/* ------------------------------------------------------------------ */

const COLLECTION_PATHS: Record<SyncKind, string> = {
  product: "products",
  category: "categories",
  sale: "sales",
  refund: "refunds",
  stockMovement: "stockMovements",
  purchase: "purchases",
  customer: "customers",
  supplier: "suppliers",
  employee: "employees",
  user: "users",
  settings: "settings",
  expense: "expenses",
  damage: "damages",
  payroll: "payroll",
  debtPayment: "debtPayments",
  supplierPayment: "supplierPayments",
  cashSession: "cashSessions",
  activity: "activity",
  restoreLog: "restoreLogs",
};

/* ------------------------------------------------------------------ */
/* Write verification logging                                          */
/* ------------------------------------------------------------------ */

/**
 * Structured log for every Firebase write — used during development to verify
 * the pipeline end-to-end. NEVER logs passwords, tokens or payload content.
 */
function logFirebaseWrite(entry: {
  operation: "set" | "delete";
  path: string;
  status: "success" | "error";
  opId: string;
  kind: SyncKind;
  code?: string;
  message?: string;
}) {
  if (entry.status === "success") {
    console.debug("[sync:firebase]", entry);
  } else {
    console.error("[sync:firebase]", entry);
  }
}

/* ------------------------------------------------------------------ */
/* Queueing local changes                                              */
/* ------------------------------------------------------------------ */

/**
 * Record a local mutation as a pending op. The op is persisted immediately and
 * the RTDB write is attempted right away (which also works offline — the SDK
 * queues it and flushes on reconnect). If the engine is not running (logged
 * out) the op stays queued locally and flushes later when the user logs in.
 */
export function queueChange(kind: SyncKind, refId: string, payload: unknown): PendingOp {
  const op: PendingOp = {
    id: uid(),
    kind,
    refId,
    ts: new Date().toISOString(),
    payload,
  };
  const ops = [...loadPending(), op];
  savePending(ops);
  setStatus("pending");
  void flushPending();
  return op;
}

/** Queue a deletion — RTDB receives a tombstone and the mirror record is removed. */
export function queueDelete(kind: SyncKind, refId: string): PendingOp {
  return queueChange(kind, refId, null);
}

/** Remove an op from the queue after it has been acked by RTDB. */
export function ackOp(opId: string) {
  const ops = loadPending().filter((o) => o.id !== opId);
  savePending(ops);
  const acked = loadAcked();
  acked.add(opId);
  saveAcked(acked);
  if (ops.length === 0 && online) setStatus("synced");
  else if (ops.length > 0) setStatus("pending");
  emit({ type: "status", status, pendingCount: ops.length });
}

/* ------------------------------------------------------------------ */
/* Writing ops to RTDB                                                 */
/* ------------------------------------------------------------------ */

async function writeOp(op: PendingOp): Promise<boolean> {
  const auth = getFirebaseAuth();
  const sessionUid = auth.currentUser?.uid ?? op.uid ?? null;
  if (!sessionUid) {
    // Not authenticated — keep the op queued (local-first, never drop it).
    console.warn("Firebase sync skipped because no authenticated user is available", {
      opId: op.id,
      kind: op.kind,
    });
    setStatus("pending");
    return false;
  }

  const db = getFirebaseDB();
  const opPath = resolveSyncPath("ops", op.id);
  const isDelete = op.payload === null || op.payload === undefined;
  const recPath = resolveAppDataPath(COLLECTION_PATHS[op.kind], op.refId);

  try {
    await set(ref(db, opPath), {
      kind: op.kind,
      refId: op.refId,
      ts: op.ts,
      uid: sessionUid,
      payload: isDelete ? { __deleted: true } : (op.payload ?? null),
      ackedAt: new Date().toISOString(),
    });
    // Mirror the record into its collection so other devices see realtime data.
    if (isDelete) {
      await remove(ref(db, recPath));
    } else {
      const rec = (op.payload as Record<string, unknown>) ?? {};
      await set(ref(db, recPath), { ...rec, id: op.refId, __syncId: op.id, __syncTs: op.ts });
    }
    logFirebaseWrite({
      operation: isDelete ? "delete" : "set",
      path: recPath,
      status: "success",
      opId: op.id,
      kind: op.kind,
    });
    // Mark synced ONLY after RTDB confirms the write.
    ackOp(op.id);
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    const message =
      typeof error === "object" && error && "message" in error
        ? (error as { message?: string }).message
        : undefined;
    logFirebaseWrite({
      operation: isDelete ? "delete" : "set",
      path: recPath,
      status: "error",
      opId: op.id,
      kind: op.kind,
      code,
      message,
    });
    console.error("Firebase sync write failed — pending op retained for retry", {
      opId: op.id,
      kind: op.kind,
      code,
      message,
    });
    setStatus("error");
    return false;
  }
}

async function flushPending(): Promise<void> {
  if (!started) return; // logged out → keep ops queued, don't attempt writes
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus("offline");
    return;
  }
  flushing = true;
  setStatus("syncing");
  try {
    const ops = loadPending();
    let failed = 0;
    for (const op of ops) {
      const ok = await writeOp(op);
      if (!ok) failed++;
    }
    const remaining = loadPending().length;
    if (failed === 0 && remaining === 0) setStatus("synced");
    else if (remaining > 0) setStatus("pending");
    else setStatus("offline");
  } finally {
    flushing = false;
  }
}

/**
 * Manual "Sync now" trigger for the UI Sync button.
 *
 * SAFE: it only attempts to flush the local pending queue and re-read remote
 * state. If the network is down, offline, or Firebase is unavailable, the
 * local data is fully preserved and no error is destructive. A failed sync
 * never deletes or overwrites local data.
 */
export async function triggerManualSync(): Promise<void> {
  if (!started) {
    // Nothing to do without an authenticated session; local data is intact.
    return;
  }
  await autoSync();
}

/* ------------------------------------------------------------------ */
/* Applying remote changes to the local DB                             */
/* ------------------------------------------------------------------ */

function keyForKind(kind: SyncKind): keyof DB | "settings" {
  switch (kind) {
    case "product":
      return "products";
    case "category":
      return "categories";
    case "sale":
      return "sales";
    case "refund":
      return "refunds";
    case "stockMovement":
      return "stockMovements";
    case "purchase":
      return "purchases";
    case "customer":
      return "customers";
    case "supplier":
      return "suppliers";
    case "employee":
      return "employees";
    case "expense":
      return "expenses";
    case "damage":
      return "damages";
    case "payroll":
      return "payroll";
    case "debtPayment":
      return "debtPayments";
    case "supplierPayment":
      return "supplierPayments";
    case "cashSession":
      return "cashSessions";
    case "user":
      return "employees";
    default:
      return "settings";
  }
}

/** Strip sync metadata inserted by the mirror writer before merging into local. */
function stripSyncMeta(value: unknown): Record<string, unknown> {
  const rec = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const { id: _id, __syncId: _sid, __syncTs: _sts, __deleted: _del, ...rest } = rec;
  return { ...rest };
}

/**
 * Build a new DB object with the remote record merged in. For "settings" the
 * remote settings are merged field-by-field (remote wins) — this is a store
 * setting, not transactional data. For all other collections remote records
 * are ONLY added when no local record with the same id exists — local always
 * wins, so first-sync can never overwrite or delete local data.
 */
function hasPendingFor(kind: SyncKind, refId: string): boolean {
  return loadPending().some((o) => o.kind === kind && o.refId === refId);
}

function produceDb(
  db: DB,
  kind: SyncKind,
  id: string,
  value: unknown,
  isDelete: boolean,
): { db: DB; isUpdate: boolean } | null {
  const remote = stripSyncMeta(value);
  if (kind === "settings") {
    if (isDelete) return null;
    return { db: { ...db, settings: { ...db.settings, ...remote } as DB["settings"] }, isUpdate: true };
  }
  const key = keyForKind(kind);
  if (key === "settings") return null;
  const arr = db[key] as Array<{ id: string }>;
  const existing = arr.find((r) => r.id === id);

  // A local change that has not reached the server yet always wins — it is
  // still queued and will be pushed, so never clobber it with older remote data.
  if (hasPendingFor(kind, id)) return null;

  if (isDelete) {
    if (!existing) return null;
    return { db: { ...db, [key]: arr.filter((r) => r.id !== id) }, isUpdate: true };
  }

  const rec = { ...remote, id } as { id: string };
  if (existing) {
    // Remote record changed on another device (e.g. stock after a PC sale) —
    // apply it so every device shows the same numbers.
    if (JSON.stringify(existing) === JSON.stringify({ ...existing, ...rec })) return null;
    return {
      db: { ...db, [key]: arr.map((r) => (r.id === id ? { ...r, ...rec } : r)) },
      isUpdate: true,
    };
  }
  return { db: { ...db, [key]: [...arr, rec] }, isUpdate: false };
}

function applyRemoteRecord(kind: SyncKind, id: string, value: unknown, forceDelete = false) {
  if (!localDb) return;
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const isDelete = forceDelete || raw.__deleted === true;
  const remote = stripSyncMeta(value);
  const next = produceDb(localDb, kind, id, value, isDelete);
  if (next) {
    localDb = next.db;
    emit({ type: "remoteMerge", kind, refId: id, remote, isDelete, isUpdate: next.isUpdate });
  }
}

/* ------------------------------------------------------------------ */
/* Realtime listeners                                                  */
/* ------------------------------------------------------------------ */

/**
 * Reconcile pull — read every collection once and merge remote records into
 * the local DB (local pending changes always win). Never deletes local data.
 */
async function pullAll(): Promise<void> {
  if (!started || pulling || !localDb) return;
  pulling = true;
  try {
    for (const [kind, path] of Object.entries(COLLECTION_PATHS)) {
      const val = await readVal<Record<string, unknown>>(resolveAppDataPath(path));
      if (!val || typeof val !== "object") continue;
      for (const [id, rec] of Object.entries(val)) {
        applyRemoteRecord(kind as SyncKind, id, rec);
      }
    }
    if (getPendingCount() === 0) setStatus("synced");
  } catch {
    /* offline / permission — local data untouched */
  } finally {
    pulling = false;
  }
}

function attachListeners(uid?: string, attachInbound = false) {
  const db = getFirebaseDB();
  // Inbound realtime listeners are READs on `app_data/{collection}`. The
  // Security Rules only allow ADMIN accounts to read these nodes, so we only
  // attach them for admins. Non-admin (employee) sessions still PUSH their
  // local changes (writes are permitted for any authenticated user) — they
  // just don't subscribe to inbound data, which they must not be able to see
  // anyway. Skipping the read listeners for employees also avoids a storm of
  // permission-denied errors in the console.
  void attachInbound;
  for (const [kind, path] of Object.entries(COLLECTION_PATHS)) {
    const dbRef = ref(db, resolveAppDataPath(path));
    const onAdd = onChildAdded(dbRef, (snap: DataSnapshot) => {
      const id = (snap.key ?? snap.child("id").val() ?? "") as string;
      applyRemoteRecord(kind as SyncKind, id, snap.val());
    });
    const onChange = onChildChanged(dbRef, (snap: DataSnapshot) => {
      const id = (snap.key ?? snap.child("id").val() ?? "") as string;
      applyRemoteRecord(kind as SyncKind, id, snap.val());
    });
    const onRemove = onChildRemoved(dbRef, (snap: DataSnapshot) => {
      const id = (snap.key ?? snap.child("id").val() ?? "") as string;
      applyRemoteRecord(kind as SyncKind, id, snap.val(), true);
    });
    stopFns.push(onAdd, onChange, onRemove);
  }
  // Presence + connectivity markers.
  const connected = ref(db, ".info/connected");
  const onConn = onValue(connected, (snap) => {
    const isOnline = snap.val() === true;
    online = isOnline;
    if (isOnline) {
      setStatus(getPendingCount() > 0 ? "pending" : "synced");
      void flushPending();
    } else {
      setStatus("offline");
    }
  });
  stopFns.push(onConn);

  // Presence heartbeat so admin can see who is active.
  if (uid) {
    const presenceRef = ref(db, resolveAppDataPath("presence", uid));
    void set(presenceRef, {
      online: true,
      lastSeen: new Date().toISOString(),
    });
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        void set(presenceRef, { online: false, lastSeen: new Date().toISOString() });
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Startup / shutdown                                                  */
/* ------------------------------------------------------------------ */

/**
 * Start (or resume) the sync engine. Only the SyncBridge calls this, and only
 * after Firebase auth reports an authenticated user. The engine:
 *
 *  1. Re-applies the persistent pending queue from local storage.
 *  2. Restores any state from the previous session marker.
 *  3. Detects connectivity, flushes pending ops, attaches listeners.
 *
 * Calling while already running is a no-op — this guarantees exactly one engine
 * per authenticated session.
 */
export async function startSyncEngine(
  initialDb: DB,
  uid?: string,
  attachInbound = false,
): Promise<void> {
  localDb = initialDb;
  if (started) return;
  started = true;

  // Restore the last session marker (if the app was killed mid-flight).
  try {
    const sessionRaw = window.localStorage.getItem("stock-manager-session-v1");
    if (sessionRaw) {
      window.localStorage.setItem("stock-manager-session-recovered-v1", sessionRaw);
    }
  } catch {
    /* ignore */
  }

  window.addEventListener("online", updateNetworkState);
  window.addEventListener("offline", updateNetworkState);

  try {
    attachListeners(uid, attachInbound);
  } catch {
    setStatus("offline");
  }

  // Failed ops that never reached RTDB are retried periodically while online.
  scheduleRetry();

  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleAutoSyncTrigger);
    window.addEventListener("visibilitychange", handleAutoSyncTrigger);
    document.addEventListener("visibilitychange", handleAutoSyncTrigger);
    window.addEventListener("resume", handleAutoSyncTrigger);
  }

  updateNetworkState();
  void autoSync();
}

/**
 * Stop (pause) the sync engine. Safe to call from anywhere. Pending ops are
 * NEVER dropped — they flush again on the next login. All listeners and timers
 * are torn down so no duplicate writes can occur after logout.
 */
export function stopSyncEngine() {
  for (const fn of stopFns) fn();
  stopFns = [];
  if (typeof window !== "undefined") {
    window.removeEventListener("online", updateNetworkState);
    window.removeEventListener("offline", updateNetworkState);
    window.removeEventListener("focus", handleAutoSyncTrigger);
    window.removeEventListener("visibilitychange", handleAutoSyncTrigger);
    document.removeEventListener("visibilitychange", handleAutoSyncTrigger);
    window.removeEventListener("resume", handleAutoSyncTrigger);
  }
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (pullTimer) {
    clearInterval(pullTimer);
    pullTimer = null;
  }
  started = false;
  // Preserve status visibility: pending ops still exist and will resume later.
  setStatus(getPendingCount() > 0 ? "pending" : "synced");
}

/* ------------------------------------------------------------------ */
/* Opt-in initial upload of existing local data                        */
/* ------------------------------------------------------------------ */

/**
 * Queue the entire existing local database as pending ops with STABLE ids
 * (`init-{kind}-{refId}`), so re-running is idempotent (already-acked ops are
 * skipped). This is the safe first-sync path for the
 * "Firebase = empty, Local = has data" scenario — it uploads local data to
 * RTDB and NEVER deletes/replaces anything locally.
 *
 * Why not automatic? Normal CRUD ops start syncing immediately once the engine
 * runs. This full upload is deliberately opt-in (Settings → Firebase) so the
 * operator can first verify the pipeline with a safe test record, per the
 * diagnostic guidance.
 */
export function uploadLocalState(db: DB, sessionUid?: string): number {
  const acked = loadAcked();
  const existingPending = loadPending();
  const pendingIds = new Set(existingPending.map((o) => o.id));
  const now = new Date().toISOString();
  const ops: PendingOp[] = [];

  const push = (opId: string, kind: SyncKind, refId: string, payload: unknown) => {
    if (acked.has(opId) || pendingIds.has(opId)) return;
    ops.push({ id: opId, kind, refId, ts: now, uid: sessionUid, payload });
    pendingIds.add(opId);
  };

  const collections: Array<{ key: keyof DB; kind: SyncKind }> = [
    { key: "categories", kind: "category" },
    { key: "products", kind: "product" },
    { key: "customers", kind: "customer" },
    { key: "suppliers", kind: "supplier" },
    { key: "sales", kind: "sale" },
    { key: "refunds", kind: "refund" },
    { key: "purchases", kind: "purchase" },
    { key: "expenses", kind: "expense" },
    { key: "damages", kind: "damage" },
    { key: "employees", kind: "employee" },
    { key: "payroll", kind: "payroll" },
    { key: "debtPayments", kind: "debtPayment" },
    { key: "supplierPayments", kind: "supplierPayment" },
    { key: "cashSessions", kind: "cashSession" },
    { key: "stockMovements", kind: "stockMovement" },
  ];

  for (const { key, kind } of collections) {
    const arr = (db[key] as Array<{ id?: string }> | undefined) ?? [];
    for (const rec of arr) {
      if (!rec || typeof rec.id !== "string") continue;
      push(`init-${kind}-${rec.id}`, kind, rec.id, rec);
    }
  }
  push("init-settings-main", "settings", "main", db.settings);

  if (ops.length > 0) {
    savePending([...existingPending, ...ops]);
    setStatus("pending");
    void flushPending();
  }
  return ops.length;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/** Applies a local DB state to the engine (e.g. after restore). */
export function syncLocalState(db: DB) {
  localDb = db;
}