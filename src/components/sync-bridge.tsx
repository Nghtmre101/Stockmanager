import { useEffect, useRef } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import { startSyncEngine, stopSyncEngine } from "@/lib/sync";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

/**
 * SyncBridge — starts the Firebase sync engine exactly ONCE after Firebase
 * authentication is restored and an authenticated user is present, and stops
 * it safely when the user signs out.
 *
 *   App starts
 *     ↓
 *   Auth state restored (ready === true)
 *     ↓
 *   user authenticated?
 *       ├─ yes → startSyncEngine(db, uid)   (idempotent — no-op if running)
 *       └─ no  → engine never starts; pending ops stay queued locally
 *
 * When the user logs in the bridge starts/resumes; when they log out the
 * bridge stops/pauses the engine without dropping any pending operations.
 * The `startedForUidRef` guard prevents duplicate engines across React
 * StrictMode double-effects and auth-changed re-renders — there is exactly
 * ONE active engine per authenticated session.
 */
export function SyncBridge() {
  const { user, ready: authReady } = useAuth();
  const { db, ready: dbReady } = useStore();
  const startedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !dbReady) return;

    if (user) {
      const uid = user.uid ?? "user";
      if (startedForUidRef.current === uid) {
        // Already running for this session — do nothing (no duplicate engine).
        return;
      }
      startedForUidRef.current = uid;
      const auth = getFirebaseAuth();
      // Only ADMIN accounts attach inbound realtime listeners — the Security
      // Rules deny employees read access to `app_data/{collection}`, so
      // subscribing would just spam permission errors. Employees still PUSH
      // their local changes (writes are allowed to any authenticated user).
      // Every authenticated device subscribes to realtime updates so a sale
      // made on the PC instantly updates stock/sales on the phone.
      void startSyncEngine(db, auth.currentUser?.uid ?? uid, true);
    } else {
      // Logged out — stop/pause the engine. Pending ops are never dropped.
      if (startedForUidRef.current) {
        stopSyncEngine();
        startedForUidRef.current = null;
      }
    }
  }, [user, authReady, dbReady, db]);

  // Safety net: if the component unmounts (e.g. full app teardown), stop the
  // engine gracefully so listeners/timers are always cleaned up.
  useEffect(
    () => () => {
      stopSyncEngine();
      startedForUidRef.current = null;
    },
    [],
  );

  return null;
}
