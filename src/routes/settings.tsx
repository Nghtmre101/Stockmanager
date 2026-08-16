import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  FileSpreadsheet,
  ImagePlus,
  Trash2,
  Flame,
  Send,
  Users,
  UserPlus,
  KeyRound,
  Volume2,
  VolumeX,
  Vibrate,
  Gift,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { Btn, Field, Toggle } from "@/components/ui-kit";
import { useAuth, type Role } from "@/lib/auth";
import {
  backupCfg,
  deleteFirebaseBackup,
  downloadFirebaseBackup,
  fetchLatestTelegramBackup,
  listFirebaseBackups,
  listLocalBackups,
  readLocalBackup,
  sendBackupToFirebase,
  sendBackupToTelegram,
  testTelegramConnection,
  type FirebaseBackupMeta,
} from "@/lib/backup";
import { sfx } from "@/lib/sfx";
import { haptics } from "@/lib/haptics";
import {
  getPendingCount,
  getSyncStatus,
  isSyncEngineRunning,
  subscribeSync,
  type SyncStatus,
} from "@/lib/sync";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Backup — Stock Manager" },
      {
        name: "description",
        content:
          "Store identity, tax identifiers, Firebase & Telegram backups, users, sounds and printing.",
      },
      { property: "og:title", content: "Settings & Backup — Stock Manager" },
      { property: "og:description", content: "Store identity, users, backups and printing." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang } = useApp();
  const { db, saveSettings, exportJSON, importJSON, exportCSV, exportExcel, resetAll } = useStore();
  const auth = useAuth();
  const isAdmin = auth.isAdmin;
  const s = db.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      {/* --- App preferences (available to all) --- */}
      <AppPrefs />

      {isAdmin && (
        <>
          <section className="space-y-3 surface-card p-4">
            <h2 className="text-sm font-black">{t("store_info")}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label={t("name")}
                value={s.storeName}
                onChange={(v) => saveSettings({ storeName: v })}
              />
              <Field
                label={t("owner")}
                value={s.ownerName}
                onChange={(v) => saveSettings({ ownerName: v })}
              />
              <Field
                label={t("address")}
                value={s.address}
                onChange={(v) => saveSettings({ address: v })}
              />
              <Field
                label={t("wilaya")}
                value={s.wilaya}
                onChange={(v) => saveSettings({ wilaya: v })}
              />
              <Field
                label={t("phone")}
                inputMode="tel"
                value={s.phone}
                onChange={(v) => saveSettings({ phone: v })}
              />
              <Field label="RIB / CCP" value={s.rib} onChange={(v) => saveSettings({ rib: v })} />
            </div>
          </section>

          <section className="space-y-3 surface-card p-4">
            <h2 className="text-sm font-black">{t("tax_info")}</h2>
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="RC" value={s.rc} onChange={(v) => saveSettings({ rc: v })} />
              <Field label="NIF" value={s.nif} onChange={(v) => saveSettings({ nif: v })} />
              <Field label="NIS" value={s.nis} onChange={(v) => saveSettings({ nis: v })} />
              <Field label="AI" value={s.ai} onChange={(v) => saveSettings({ ai: v })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Toggle
                label={t("tva_enabled")}
                checked={s.tvaEnabled}
                onChange={(v) => saveSettings({ tvaEnabled: v })}
              />
              <Field
                label={t("tva_rate")}
                inputMode="decimal"
                value={String(s.tvaRate)}
                onChange={(v) => saveSettings({ tvaRate: Number(v) || 0 })}
              />
              <Toggle
                label={t("stamp_duty")}
                checked={s.stampDuty}
                onChange={(v) => saveSettings({ stampDuty: v })}
              />
            </div>
          </section>

          <section className="space-y-3 surface-card p-4">
            <h2 className="text-sm font-black">{t("print")}</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                  {t("print_width")}
                </span>
                <select
                  value={s.printWidth}
                  onChange={(e) =>
                    saveSettings({ printWidth: e.target.value as "58" | "80" | "a4" })
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none"
                >
                  <option value="58">58mm</option>
                  <option value="80">80mm</option>
                  <option value="a4">A4</option>
                </select>
              </label>
              <Field
                label={t("min_stock")}
                inputMode="decimal"
                value={String(s.lowStock)}
                onChange={(v) => saveSettings({ lowStock: Number(v) || 0 })}
              />
              <Field
                label={t("receipt_footer")}
                value={s.receiptFooter}
                onChange={(v) => saveSettings({ receiptFooter: v })}
              />
            </div>

            <div className="grid gap-3 rounded-xl border border-input p-3 sm:grid-cols-[auto_1fr]">
              <div className="grid h-24 w-40 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-secondary/40">
                {s.logo ? (
                  <img src={s.logo} alt={t("logo")} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[11px] font-bold text-muted-foreground">{t("logo")}</span>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{t("logo_hint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Btn tone="primary" onClick={() => logoRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" /> {t("upload_logo")}
                  </Btn>
                  {s.logo ? (
                    <Btn tone="muted" onClick={() => saveSettings({ logo: "" })}>
                      <Trash2 className="h-4 w-4" /> {t("remove_logo")}
                    </Btn>
                  ) : null}
                </div>
                <Toggle
                  label={t("logo_on_receipt")}
                  checked={s.logoOnReceipt !== false}
                  onChange={(v) => saveSettings({ logoOnReceipt: v })}
                />
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => saveSettings({ logo: String(reader.result || "") });
                    reader.readAsDataURL(f);
                  }}
                />
              </div>
            </div>
          </section>

          <UsersSection />
          <FirebaseSection />
          <TelegramSection />
          <LocalBackupsSection />

          <section className="space-y-3 surface-card p-4">
            <h2 className="text-sm font-black">{t("backup")}</h2>
            <p className="text-xs font-semibold text-muted-foreground">{t("offline_note")}</p>
            <p className="text-xs font-semibold text-muted-foreground">{t("export_lang_hint")}</p>
            <div className="flex flex-wrap gap-2">
              <Btn tone="primary" onClick={exportJSON}>
                <Download className="h-4 w-4" /> {t("export_json")}
              </Btn>
              <Btn tone="muted" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t("import_json")}
              </Btn>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importJSON(f);
                  e.target.value = "";
                }}
              />
              {(["sales", "products", "expenses", "debts"] as const).map((k) => (
                <Btn key={k} tone="accent" onClick={() => exportCSV(k)}>
                  <FileSpreadsheet className="h-4 w-4" /> {k}
                </Btn>
              ))}
              <Btn tone="success" onClick={() => void exportExcel("all", lang)}>
                <FileSpreadsheet className="h-4 w-4" /> {t("full_report")} (Excel)
              </Btn>
              {(["sales", "products", "purchases", "customers", "suppliers", "staff"] as const).map(
                (k) => (
                  <Btn key={`x-${k}`} tone="primary" onClick={() => void exportExcel(k, lang)}>
                    <FileSpreadsheet className="h-4 w-4" /> {k}.xlsx
                  </Btn>
                ),
              )}
              <Btn tone="danger" onClick={() => window.confirm(t("reset_confirm")) && resetAll()}>
                <RotateCcw className="h-4 w-4" /> {t("reset_data")}
              </Btn>
            </div>
          </section>
        </>
      )}

      {!isAdmin && (
        <section className="surface-card p-4 text-sm text-muted-foreground">
          <p className="font-semibold">
            Only the administrator can change store, tax, backup and integration settings.
          </p>
        </section>
      )}
    </div>
  );
}

function AppPrefs() {
  const [muted, setMuted] = useState(!sfx.isEnabled());
  const [buzz, setBuzz] = useState(haptics.isEnabled());
  const { t, toggleLang, shuffleTheme } = useApp();
  const { db, saveSettings } = useStore();
  const s = db.settings;
  return (
    <>
      <section className="space-y-3 surface-card p-4">
        <h2 className="text-sm font-black">Preferences</h2>
        <div className="flex flex-wrap gap-2">
          <Btn
            tone="primary"
            onClick={() => {
              sfx.click();
              toggleLang();
            }}
          >
            Change language
          </Btn>
          <Btn
            tone="accent"
            onClick={() => {
              sfx.click();
              shuffleTheme();
            }}
          >
            Random theme
          </Btn>
          <Btn
            tone="muted"
            onClick={() => {
              const v = !sfx.isEnabled();
              sfx.setEnabled(v);
              setMuted(!v);
              if (v) sfx.tap();
            }}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {muted ? " Sounds off" : " Sounds on"}
          </Btn>
          <Btn
            tone="muted"
            onClick={() => {
              const v = !haptics.isEnabled();
              haptics.setEnabled(v);
              setBuzz(v);
            }}
          >
            <Vibrate className="h-4 w-4" />
            {buzz ? ` ${t("haptics_on")}` : ` ${t("haptics_off")}`}
          </Btn>
        </div>
      </section>

      <section className="space-y-3 surface-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <Gift className="h-4 w-4" /> {t("loyalty")}
        </h2>
        <p className="text-xs font-semibold text-muted-foreground">{t("loyalty_hint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle
            label={t("loyalty_enabled")}
            checked={s.loyaltyEnabled}
            onChange={(v) => saveSettings({ loyaltyEnabled: v })}
          />
          <Field
            label={t("loyalty_earn_per")}
            inputMode="decimal"
            value={String(s.loyaltyEarnPer)}
            onChange={(v) => saveSettings({ loyaltyEarnPer: Number(v) || 0 })}
          />
          <Field
            label={t("loyalty_point_value")}
            inputMode="decimal"
            value={String(s.loyaltyPointValue)}
            onChange={(v) => saveSettings({ loyaltyPointValue: Number(v) || 0 })}
          />
        </div>
      </section>
    </>
  );
}

function UsersSection() {
  const { users, addUser, removeUser, changePassword, refreshUsers } = useAuth();
  const { db } = useStore();
  const [uname, setUname] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await addUser({ username: uname, password: pass, role, name, email, employeeId });
    if (r.ok) {
      sfx.success();
      setMsg("User created.");
      setUname("");
      setPass("");
      setName("");
      setEmail("");
      setEmployeeId("");
      setRole("employee");
    } else {
      sfx.error();
      setMsg(r.error || "Failed to create user.");
    }
  };

  return (
    <section className="space-y-3 surface-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-black">
        <Users className="h-4 w-4" /> Users & access
      </h2>
      <p className="text-xs font-semibold text-muted-foreground">
        Admins access everything. Employees can sell, view stock, view suppliers, use the cashbox
        total, take money from their salary and change theme / language.
      </p>

      <form
        onSubmit={submit}
        className="grid gap-2 rounded-xl border border-input p-3 sm:grid-cols-6"
      >
        <Field label="Username" value={uname} onChange={setUname} className="sm:col-span-2" />
        <Field
          label="Password"
          type="password"
          value={pass}
          onChange={setPass}
          className="sm:col-span-2"
        />
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none"
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <Field label="Display name" value={name} onChange={setName} className="sm:col-span-2" />
        <Field
          label="Email (for password reset)"
          value={email}
          onChange={setEmail}
          className="sm:col-span-2"
        />
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
            Link to employee
          </span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none"
          >
            <option value="">— none —</option>
            {db.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-6 flex items-center gap-2">
          <Btn tone="primary" type="submit">
            <UserPlus className="h-4 w-4" /> Add user
          </Btn>
          {msg && <span className="text-xs font-bold">{msg}</span>}
        </div>
      </form>

      <div className="divide-y divide-border rounded-xl border border-input">
        {users.map((u) => (
          <div key={u.username} className="flex flex-wrap items-center gap-2 p-3 text-xs">
            <div className="flex-1 min-w-40">
              <p className="font-black">{u.name || u.username}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                @{u.username} · {u.role}
                {u.email ? ` · ${u.email}` : ""}
              </p>
            </div>
            <Btn
              tone="muted"
              onClick={async () => {
                const p = window.prompt("New password:");
                if (p) {
                  await changePassword(u.username, p);
                  sfx.success();
                }
              }}
            >
              <KeyRound className="h-3 w-3" /> Password
            </Btn>
            <Btn
              tone="danger"
              onClick={() => {
                if (window.confirm(`Remove ${u.username}?`)) {
                  removeUser(u.username);
                  refreshUsers();
                  sfx.warn();
                }
              }}
            >
              <Trash2 className="h-3 w-3" /> Remove
            </Btn>
          </div>
        ))}
      </div>
    </section>
  );
}

function FirebaseSection() {
  const [cfg, setCfg] = useState(backupCfg.firebase.get());
  const { db, restoreJSON } = useStore();
  const [restoring, setRestoring] = useState(false);
  const [sync, setSync] = useState<{ status: SyncStatus; pending: number; running: boolean }>({
    status: getSyncStatus(),
    pending: getPendingCount(),
    running: isSyncEngineRunning(),
  });
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Cloud backup list (Firebase) — admin-only.
  const [cloud, setCloud] = useState<FirebaseBackupMeta[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  useEffect(() => {
    setCfg(backupCfg.firebase.get());
    const unsub = subscribeSync((e) => {
      if (e.type === "status") {
        setSync({ status: e.status, pending: e.pendingCount, running: isSyncEngineRunning() });
      }
    });
    return unsub;
  }, []);

  // Load the list of cloud backups whenever the Firebase section mounts.
  const refreshCloud = () => {
    setCloudBusy(true);
    listFirebaseBackups()
      .then((list) => setCloud(list))
      .catch((e) => setCloudMsg(`Could not list backups: ${e}`))
      .finally(() => setCloudBusy(false));
  };
  useEffect(() => {
    refreshCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (patch: Partial<typeof cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    backupCfg.firebase.set(next);
  };

  const statusLabel: Record<SyncStatus, string> = {
    synced: "Synced with Firebase",
    syncing: "Syncing…",
    pending: "Pending changes waiting to sync",
    offline: "Offline — changes stored locally",
    error: "Sync error — retrying",
  };

  const humanSize = (n?: number) => (n ? `${(n / 1024).toFixed(1)} KB` : "—");

  return (
    <section className="space-y-3 surface-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-black">
        <Flame className="h-4 w-4" /> Firebase
      </h2>
      <p className="text-xs font-semibold text-muted-foreground">
        Paste the values from your Firebase project (Project settings → General → SDK setup). Used
        for password-reset emails and cloud backups. Stored only on this device.
      </p>

      {/* Sync status */}
      <div
        className={`rounded-xl border px-3 py-2 text-xs font-bold ${sync.status === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-input bg-secondary/40"}`}
      >
        <p>
          {sync.running
            ? `Sync engine: ${statusLabel[sync.status]}`
            : "Sync engine: not running (sign in to start syncing)"}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
          Pending local operations: {sync.pending} — local data is always saved first and is never
          deleted by sync.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="API key" value={cfg.apiKey ?? ""} onChange={(v) => save({ apiKey: v })} />
        <Field
          label="Auth domain"
          value={cfg.authDomain ?? ""}
          onChange={(v) => save({ authDomain: v })}
        />
        <Field
          label="Project ID"
          value={cfg.projectId ?? ""}
          onChange={(v) => save({ projectId: v })}
        />
        <Field
          label="Storage bucket"
          value={cfg.storageBucket ?? ""}
          onChange={(v) => save({ storageBucket: v })}
        />
        <Field label="App ID" value={cfg.appId ?? ""} onChange={(v) => save({ appId: v })} />
        <Field
          label="Messaging sender ID"
          value={cfg.messagingSenderId ?? ""}
          onChange={(v) => save({ messagingSenderId: v })}
        />
      </div>

      {/* ---- PC → Phone (admin cloud backup) ---- */}
      <div className="space-y-2 rounded-xl border border-input p-3">
        <p className="text-xs font-black">Cloud backups (Admin only)</p>
        <p className="text-[11px] font-semibold text-muted-foreground">
          Each backup is stored separately — nothing is overwritten. Only ADMIN accounts can read
          or write these in Firebase.
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn
            tone="primary"
            disabled={uploading}
            onClick={async () => {
              setUploading(true);
              setUploadMsg(null);
              try {
                const json = localStorage.getItem("nizam-pos-db-v1") || "{}";
                await sendBackupToFirebase(json);
                sfx.success();
                setUploadMsg("Backup uploaded to Firebase. The Android admin app can now download it.");
                refreshCloud();
              } catch (e) {
                sfx.error();
                setUploadMsg(`Backup failed: ${e}`);
              } finally {
                setUploading(false);
              }
            }}
          >
            <ShieldCheck className="h-4 w-4" /> {uploading ? "Uploading…" : "Backup PC data to cloud"}
          </Btn>
          <Btn
            tone="muted"
            disabled={cloudBusy}
            onClick={() => {
              refreshCloud();
              setCloudMsg(null);
            }}
          >
            <RotateCcw className="h-4 w-4" /> {cloudBusy ? "Loading…" : "Refresh list"}
          </Btn>
        </div>
        {uploadMsg && <p className="text-xs font-bold">{uploadMsg}</p>}

        {/* List of cloud backups */}
        <div className="space-y-2 pt-1">
          {cloud.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No cloud backups yet. Click “Backup PC data to cloud” to create one.
            </p>
          ) : (
            cloud.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-input p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold break-words">{b.createdAt}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {humanSize(b.size)} · {b.device.slice(0, 40)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn
                    tone="accent"
                    disabled={restoring}
                    onClick={async () => {
                      setRestoring(true);
                      try {
                        const json = await downloadFirebaseBackup(b.id);
                        const f = new File([json], "firebase-backup.json", {
                          type: "application/json",
                        });
                        await restoreJSON(f);
                        sfx.success();
                        window.alert("Restored the selected backup from Firebase.");
                      } catch (e) {
                        sfx.error();
                        window.alert(`Restore failed: ${e}`);
                      } finally {
                        setRestoring(false);
                      }
                    }}
                  >
                    <Download className="h-3 w-3" /> Restore
                  </Btn>
                  <Btn
                    tone="muted"
                    disabled={cloudBusy}
                    onClick={async () => {
                      if (!window.confirm("Delete this cloud backup? This cannot be undone.")) return;
                      setCloudBusy(true);
                      try {
                        await deleteFirebaseBackup(b.id);
                        setCloud((c) => c.filter((x) => x.id !== b.id));
                        sfx.success();
                      } catch (e) {
                        sfx.error();
                        setCloudMsg(`Delete failed: ${e}`);
                      } finally {
                        setCloudBusy(false);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Btn>
                </div>
              </div>
            ))
          )}
        </div>
        {cloudMsg && <p className="text-xs font-bold text-destructive">{cloudMsg}</p>}
      </div>

      {/* ---- Phone → PC: upload a backup file from the Android admin ---- */}
      <div className="space-y-2 rounded-xl border border-input p-3">
        <p className="text-xs font-black">Restore a backup file (Phone → PC)</p>
        <p className="text-[11px] font-semibold text-muted-foreground">
          Select a backup JSON (exported from the Android admin app or this screen). A safety
          backup of the current data is created automatically before anything is merged.
        </p>
        <input
          type="file"
          accept="application/json"
          className="block w-full text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void (async () => {
              setRestoring(true);
              try {
                await restoreJSON(f);
                sfx.success();
                window.alert(
                  "Backup restored. New records were merged in; existing data was kept and a safety copy was saved.",
                );
              } catch (err) {
                sfx.error();
                window.alert(`Restore failed: ${err}`);
              } finally {
                setRestoring(false);
              }
            })();
          }}
        />
        <p className="text-[11px] font-semibold text-muted-foreground">
          Safety: a backup is NEVER overwritten and your current data is always preserved. Restoring
          only adds records that don't already exist locally and fills missing settings.
        </p>
      </div>

      <p className="text-[11px] font-semibold text-muted-foreground">
        Live sync: the POS keeps the Android admin app updated automatically (PC → Firebase →
        Android). Local data is never deleted or replaced by sync.
      </p>
    </section>
  );
}

function TelegramSection() {
  const [cfg, setCfg] = useState(backupCfg.telegram.get());
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const { importJSON, restoreJSON } = useStore();
  useEffect(() => {
    setCfg(backupCfg.telegram.get());
  }, []);
  const save = (patch: Partial<typeof cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    backupCfg.telegram.set(next);
  };
  return (
    <section className="space-y-3 surface-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-black">
        <Send className="h-4 w-4" /> Telegram bot backup
      </h2>
      <p className="text-xs font-semibold text-muted-foreground">
        Create a bot with @BotFather, paste the bot token, then send /start to the bot and paste
        your chat ID (get it from https://api.telegram.org/bot{"<token>"}/getUpdates).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field
          label="Bot token"
          value={cfg.botToken ?? ""}
          onChange={(v) => save({ botToken: v })}
        />
        <Field label="Chat ID" value={cfg.chatId ?? ""} onChange={(v) => save({ chatId: v })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn
          tone="primary"
          onClick={async () => {
            try {
              const json = localStorage.getItem("nizam-pos-db-v1") || "{}";
              await sendBackupToTelegram(json);
              sfx.success();
              window.alert("Backup sent to Telegram.");
            } catch (e) {
              sfx.error();
              window.alert(`Telegram send failed: ${e}`);
            }
          }}
        >
          <Send className="h-4 w-4" /> Send backup to Telegram
        </Btn>

        <Btn
          tone="accent"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            setTestMsg(null);
            try {
              const r = await testTelegramConnection();
              if (r.ok) {
                sfx.success();
                setTestMsg(
                  `Connection OK. ${r.description ?? ""}${r.chatTitle ? ` Chat: ${r.chatTitle} (@${r.chatType ?? ""}).` : ""}`,
                );
              } else {
                sfx.error();
                const step =
                  r.step === "token"
                    ? "Bot token check failed: "
                    : r.step === "chatId"
                      ? "Chat ID check failed: "
                      : r.step === "chat"
                        ? "Chat lookup failed: "
                        : "Telegram test failed: ";
                setTestMsg(`${step}${r.description ?? r.error ?? "Unknown error"}`);
              }
            } catch (e) {
              sfx.error();
              setTestMsg(`Could not run the test: ${e}`);
            } finally {
              setTesting(false);
            }
          }}
        >
          <RefreshCcw className="h-4 w-4" /> {testing ? "Testing…" : "Test Telegram connection"}
        </Btn>

        <Btn
          tone="accent"
          onClick={async () => {
            try {
              const json = await fetchLatestTelegramBackup();
              const f = new File([json], "telegram-backup.json", { type: "application/json" });
              await restoreJSON(f);
              sfx.success();
              window.alert("Restored the latest backup from Telegram.");
            } catch (e) {
              sfx.error();
              window.alert(
                `Restore failed: ${e}. Tip: forward the backup message to the bot chat first.`,
              );
            }
          }}
        >
          <RefreshCcw className="h-4 w-4" /> Restore latest from Telegram
        </Btn>
      </div>
      {testMsg && (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-bold ${testMsg.startsWith("Connection OK") ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
        >
          {testMsg}
        </p>
      )}
    </section>
  );
}

function LocalBackupsSection() {
  const [keys, setKeys] = useState<string[]>([]);
  const { restoreJSON } = useStore();

  useEffect(() => {
    setKeys(listLocalBackups().slice(0, 30));
  }, []);

  const refresh = () => setKeys(listLocalBackups().slice(0, 30));

  return (
    <section className="space-y-3 surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black">Local backups</h2>
          <p className="text-xs font-semibold text-muted-foreground">
            The app keeps the latest 30 local snapshots automatically. Restore one when needed.
          </p>
        </div>
        <Btn tone="muted" onClick={refresh}>
          <RotateCcw className="h-4 w-4" /> Refresh list
        </Btn>
      </div>
      <div className="space-y-2">
        {keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">No local backups found yet.</p>
        ) : (
          keys.map((key) => (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-input p-3 text-xs"
            >
              <div className="min-w-0">
                <p className="font-semibold break-words">{key}</p>
              </div>
              <Btn
                tone="accent"
                onClick={async () => {
                  const json = readLocalBackup(key);
                  if (!json) {
                    window.alert("Backup not found.");
                    return;
                  }
                  try {
                    const file = new File([json], key, { type: "application/json" });
                    await restoreJSON(file);
                    sfx.success();
                    window.alert("Restored local backup.");
                  } catch (e) {
                    sfx.error();
                    window.alert(`Restore failed: ${e}`);
                  }
                }}
              >
                <RefreshCcw className="h-4 w-4" /> Restore
              </Btn>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
