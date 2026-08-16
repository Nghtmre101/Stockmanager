import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import {
  getSyncStatus,
  getPendingCount,
  subscribeSync,
  triggerManualSync,
  type SyncStatus as SyncStatusType,
} from "@/lib/sync";
import { sfx } from "@/lib/sfx";

/**
 * Manual cloud-sync control shown in the app header.
 *
 * - Works fully offline: if there is no connection or Firebase is unavailable,
 *   pressing Sync simply re-attempts the queue flush and never destroys local
 *   data.
 * - Reflects the live engine status (Synced / Syncing / Offline / Pending /
 *   Error) and the number of pending local changes.
 * - Auto-sync still runs in the background; this is just an operator-driven
 *   "Sync now" trigger plus a visibility indicator.
 */
export function SyncStatusButton() {
  const [status, setStatus] = useState<SyncStatusType>(getSyncStatus());
  const [pending, setPending] = useState<number>(getPendingCount());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribeSync((e) => {
      if (e.type === "status") {
        setStatus(e.status);
        setPending(e.pendingCount);
      }
    });
  }, []);

  const onSync = async () => {
    setBusy(true);
    sfx.tap();
    try {
      await triggerManualSync();
    } finally {
      setBusy(false);
    }
  };

  const label =
    status === "synced"
      ? "Synced"
      : status === "syncing"
        ? "Syncing…"
        : status === "offline"
          ? "Offline"
          : status === "pending"
            ? `Pending${pending ? ` (${pending})` : ""}`
            : "Sync error";

  const Icon =
    busy || status === "syncing"
      ? Loader2
      : status === "offline"
        ? CloudOff
        : status === "error"
          ? AlertTriangle
          : Cloud;

  return (
    <button
      onClick={onSync}
      disabled={busy}
      title="Auto-sync is running in the background — tap to sync now"
      className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold text-primary-foreground backdrop-blur transition hover:bg-primary-foreground/25 active:scale-95 disabled:opacity-70"
    >
      <Icon className={busy || status === "syncing" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      <span className="hidden sm:inline">{label}</span>
      <RefreshCw className="h-3 w-3 opacity-70" />
    </button>
  );
}