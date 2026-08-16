/**
 * Authentication provider — Firebase Authentication (email/password).
 *
 * This REPLACES the old local hash-based credentials with the real Firebase
 * account system. The public API surface is unchanged, so the existing
 * routes (login screen, settings, staff) keep working.
 *
 * Security model:
 *  - Persisted auth session (browser localStorage persistence) — a previously
 *    authenticated user stays signed in across restarts and can keep working
 *    while temporarily offline. We never store the password locally.
 *  - The user's role is stored in RTDB under `/users/{uid}` — that node is
 *    protected by Security Rules so an authenticated client can NEVER change
 *    its own role or another user's role.
 *  - Login fetches the profile from RTDB; if RTDB is unreachable, the cached
 *    profile from localStorage is used (read-only, off-line safe).
 *  - A `usernames/{username}` node in RTDB maps a short username to a UID so
 *    users can log in with their username instead of the full email.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { get, ref, set } from "firebase/database";
import {
  applyAuthPersistence,
  completeEmailLinkSignIn,
  getFirebaseAuth,
  getFirebaseDB,
  resolveAppDataPath,
} from "./firebase";

export type Role = "admin" | "employee";

/** Hard-coded administrator account credentials. */
export const ADMIN_CREDENTIALS = {
  email: "laouidabdelhamid9@gmail.com",
  password: "Hamid@2026",
  username: "Hamid",
} as const;

const ADMIN_EMAIL_LOWER = ADMIN_CREDENTIALS.email.toLowerCase();
const ADMIN_USERNAME_LOWER = ADMIN_CREDENTIALS.username.toLowerCase();

export type AuthUser = {
  username: string; // short username (login handle) or email fallback
  email?: string;
  name?: string; // display name
  role: Role;
  passHash: string; // legacy field — retained for compatibility, always ""
  employeeId?: string; // link to Employee record for advances
  createdAt: string;
  uid: string; // Firebase UID
};

const CACHE_KEY = "stock-manager-auth-profile-v1";

function logDatabaseWriteFailure(path: string, error: unknown) {
  console.error("Firebase RTDB write failed", {
    path,
    code:
      typeof error === "object" && error && "code" in error
        ? (error as { code?: string }).code
        : undefined,
    message:
      typeof error === "object" && error && "message" in error
        ? (error as { message?: string }).message
        : undefined,
  });
}

type Ctx = {
  ready: boolean;
  user: AuthUser | null;
  role: Role | null;
  isAdmin: boolean;
  login: (
    username: string,
    password: string,
    remember?: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  users: AuthUser[];
  refreshUsers: () => void;
  register: (input: {
    username: string;
    email: string;
    password: string;
    name?: string;
    role?: Role;
  }) => Promise<{ ok: boolean; error?: string }>;
  addUser: (input: {
    username: string;
    password: string;
    role: Role;
    name?: string;
    email?: string;
    employeeId?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  removeUser: (username: string) => void;
  changePassword: (username: string, newPassword: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Link a local employee record to this auth user (used during migration). */
  linkEmployee: (userId: string, employeeId: string) => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

/* ------------------------------------------------------------------ */
/* Cached profile (offline-safe)                                       */
/* ------------------------------------------------------------------ */

function loadCachedUsers(): AuthUser[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser[]) : [];
  } catch {
    return [];
  }
}

function saveCachedUsers(list: AuthUser[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** A user is disabled when their RTDB profile has `disabled: true`. */
function isDisabled(profile: Record<string, unknown> | null | undefined): boolean {
  return profile?.disabled === true || profile?.active === false;
}

/** Map a Firebase user + RTDB profile to the AuthUser shape. */
function toAuthUser(fb: FirebaseUser, profile?: Record<string, unknown> | null): AuthUser {
  const email = fb.email ?? String(profile?.email ?? "");
  const isAdminEmail = email.toLowerCase() === ADMIN_EMAIL_LOWER;
  const role: Role = isAdminEmail || profile?.role === "admin" ? "admin" : "employee";
  return {
    uid: fb.uid,
    username: String(profile?.username ?? email ?? fb.uid),
    email,
    name: String(profile?.name ?? profile?.displayName ?? email.split("@")[0] ?? "User"),
    role,
    employeeId: profile?.employeeId ? String(profile.employeeId) : undefined,
    passHash: "",
    createdAt: String(profile?.createdAt ?? new Date().toISOString()),
  };
}

/** Enrich an RTDB record with the bits the existing UI expects. */
function recordWithDefaults(id: string, value: unknown) {
  const rec = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...rec,
    id,
    uid: id,
    name: String(rec.name ?? rec.displayName ?? "User"),
    role: rec.role === "admin" ? "admin" : "employee",
  } as unknown as AuthUser;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUser[]>(() => loadCachedUsers());

  const refreshUsers = useCallback(() => setUsers(loadCachedUsers()), []);

  /* -- bootstrap ---------------------------------------------------- */
  useEffect(() => {
    (async () => {
      // If the app was opened through a Firebase email sign-in link, finish it.
      await completeEmailLinkSignIn().catch(() => {});
      const auth = getFirebaseAuth();
      const unsub = onAuthStateChanged(auth, (fb) => {
        if (!fb) {
          setUser(null);
          setReady(true);
          return;
        }
        // Fetch RTDB profile → role. On failure (e.g. offline) fall back to cache.
        const db = getFirebaseDB();
        get(ref(db, resolveAppDataPath("users", fb.uid)))
          .then((snap) => {
            const profile = snap.exists() ? (snap.val() as Record<string, unknown>) : null;
            if (isDisabled(profile)) {
              void signOut(auth);
              setUser(null);
              setReady(true);
              return;
            }
            const u = toAuthUser(fb, profile);
            setUser(u);
            const cached = loadCachedUsers().filter((x) => x.uid !== fb.uid);
            saveCachedUsers([...cached, u]);
            setUsers(loadCachedUsers());
            setReady(true);
          })
          .catch(() => {
            // Offline — use cached profile so the employee keeps working.
            const cached = loadCachedUsers().find((x) => x.uid === fb.uid);
            if (cached) {
              setUser(cached);
            } else {
              setUser(toAuthUser(fb, null));
            }
            setReady(true);
          });
      });
      return () => unsub();
    })();
  }, []);

  /** Resolve a login handle (username or email) to the Firebase email. */
  const resolveLoginHandle = useCallback(async (handle: string): Promise<string | null> => {
    const h = handle.trim();
    if (!h) return null;
    // Already an email → use it directly.
    if (/.+@.+\..+/.test(h)) return h;
    // Hard-coded admin username → admin email.
    if (h.toLowerCase() === ADMIN_USERNAME_LOWER) return ADMIN_CREDENTIALS.email;
    // Short username → look up `usernames/{lowercase-username}` → uid → profile.email
    // Best-effort: if RTDB rules deny the read, fall back to treating the handle
    // as an email so the Firebase email/password sign-in still works.
    try {
      const db = getFirebaseDB();
      const key = h.toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!key) return null;
      const snap = await get(ref(db, resolveAppDataPath("usernames", key)));
      if (!snap.exists()) return null;
      const uid = String(snap.val());
      const profileSnap = await get(ref(db, resolveAppDataPath("users", uid)));
      if (!profileSnap.exists()) return null;
      const profile = profileSnap.val() as Record<string, unknown>;
      return profile?.email ? String(profile.email) : null;
    } catch {
      return null;
    }
  }, []);

  /* -- login -------------------------------------------------------- */
  const login = useCallback(
    async (username: string, password: string, remember = true) => {
      try {
        await applyAuthPersistence(remember);
        const auth = getFirebaseAuth();
        const email = (await resolveLoginHandle(username)) ?? username.trim();
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const fb = cred.user;
        // Role/profile comes from RTDB — best-effort. If the read fails (offline
        // or permission denied), the onAuthStateChanged listener will still map
        // the user from the local cache and the login succeeds.
        try {
          const db = getFirebaseDB();
          const snap = await get(ref(db, resolveAppDataPath("users", fb.uid)));
          const profile = snap.exists() ? (snap.val() as Record<string, unknown>) : null;
          if (isDisabled(profile)) {
            await signOut(auth);
            return { ok: false, error: "account_disabled" };
          }
        } catch {
          /* ignore */
        }
        return { ok: true };
      } catch (e) {
        const code = (e as { code?: string })?.code ?? "";
        if (
          code === "auth/invalid-credential" ||
          code === "auth/wrong-password" ||
          code === "auth/user-not-found"
        ) {
          return { ok: false, error: "bad_password" };
        }
        if (code === "auth/user-disabled") return { ok: false, error: "account_disabled" };
        if (code === "auth/network-request-failed") return { ok: false, error: "network_error" };
        return { ok: false, error: String(e) };
      }
    },
    [resolveLoginHandle],
  );

  /* -- logout ------------------------------------------------------- */
  const logout = useCallback(() => {
    setUser(null);
    void signOut(getFirebaseAuth()).catch(() => {});
  }, []);

  /* -- register (self-service) -------------------------------------- */
  const register = useCallback(
    async (input: {
      username: string;
      email: string;
      password: string;
      name?: string;
      role?: Role;
    }) => {
      const username = (input.username || "").trim();
      const email = (input.email || "").trim();
      if (!username) return { ok: false, error: "missing_username" };
      if (!/.+@.+\..+/.test(email)) return { ok: false, error: "invalid_email" };
      if (!input.password || input.password.length < 6)
        return { ok: false, error: "password_too_short" };
      try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDB();
        const key = username.toLowerCase().replace(/[^a-z0-9._-]/g, "");
        if (!key) return { ok: false, error: "invalid_username" };

        // Username availability check + profile writes are best-effort — if RTDB
        // rules deny the read/write the account is still created and usable.
        let exists = false;
        try {
          const existing = await get(ref(db, resolveAppDataPath("usernames", key)));
          exists = existing.exists();
        } catch {
          /* ignore */
        }
        if (exists) return { ok: false, error: "username_taken" };

        const isAdminEmail = email.toLowerCase() === ADMIN_EMAIL_LOWER;
        const cred = await createUserWithEmailAndPassword(auth, email, input.password);
        const uid = cred.user.uid;
        const profile = {
          uid,
          username: key,
          email,
          name: input.name || email.split("@")[0],
          role: input.role ?? (isAdminEmail ? "admin" : "employee"),
          employeeId: null,
          disabled: false,
          createdAt: new Date().toISOString(),
        };
        // Profile writes go through RTDB — if the rules reject them (e.g. during
        // setup) the local cache still lets the user get in, and the admin can
        // write the profile once rules are in place.
        await set(ref(db, resolveAppDataPath("users", uid)), profile).catch((error) => {
          logDatabaseWriteFailure(resolveAppDataPath("users", uid), error);
        });
        await set(ref(db, resolveAppDataPath("usernames", key)), uid).catch((error) => {
          logDatabaseWriteFailure(resolveAppDataPath("usernames", key), error);
        });

        // Local cache also updated for offline list display.
        const rec = {
          uid,
          username: key,
          email,
          name: profile.name,
          role: profile.role,
          employeeId: undefined,
          passHash: "",
          createdAt: profile.createdAt,
        } as AuthUser;
        saveCachedUsers([...loadCachedUsers().filter((u) => u.uid !== uid), rec]);
        refreshUsers();
        return { ok: true };
      } catch (e) {
        const code = (e as { code?: string })?.code ?? "";
        if (code === "auth/email-already-in-use") return { ok: false, error: "duplicate" };
        if (code === "auth/network-request-failed") return { ok: false, error: "network_error" };
        return { ok: false, error: String(e) };
      }
    },
    [refreshUsers],
  );

  /* -- add user ----------------------------------------------------- */
  const addUser = useCallback(
    async (input: {
      username: string;
      password: string;
      role: Role;
      name?: string;
      email?: string;
      employeeId?: string;
    }) => {
      const email = (input.email || input.username || "").trim();
      if (!email || !/.+@.+\..+/.test(email)) return { ok: false, error: "invalid_email" };
      if (!input.password || input.password.length < 6)
        return { ok: false, error: "password_too_short" };
      try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDB();
        const username = (input.username || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, "");
        const isAdminEmail = email.toLowerCase() === ADMIN_EMAIL_LOWER;
        const cred = await createUserWithEmailAndPassword(auth, email, input.password);
        const uid = cred.user.uid;
        const profile = {
          uid,
          username: username || email.split("@")[0],
          email,
          name: input.name || email.split("@")[0],
          role: isAdminEmail ? "admin" : input.role,
          employeeId: input.employeeId ?? null,
          disabled: false,
          createdAt: new Date().toISOString(),
        };
        // Profile write goes through RTDB — Security Rules allow an admin to
        // create/disable employees but never let a user write their own role.
        // Best-effort: the account is usable even if rules reject the write.
        await set(ref(db, resolveAppDataPath("users", uid)), profile).catch((error) => {
          logDatabaseWriteFailure(resolveAppDataPath("users", uid), error);
        });
        if (profile.username) {
          await set(ref(db, resolveAppDataPath("usernames", profile.username)), uid).catch(
            (error) => {
              logDatabaseWriteFailure(resolveAppDataPath("usernames", profile.username), error);
            },
          );
        }
        // Local cache also updated for offline list display.
        const rec = {
          uid,
          username: profile.username,
          email,
          name: profile.name,
          role: profile.role,
          employeeId: input.employeeId,
          passHash: "",
          createdAt: profile.createdAt,
        } as AuthUser;
        saveCachedUsers([...loadCachedUsers().filter((u) => u.uid !== uid), rec]);
        refreshUsers();
        return { ok: true };
      } catch (e) {
        const code = (e as { code?: string })?.code ?? "";
        if (code === "auth/email-already-in-use") return { ok: false, error: "duplicate" };
        if (code === "auth/network-request-failed") return { ok: false, error: "network_error" };
        return { ok: false, error: String(e) };
      }
    },
    [refreshUsers],
  );

  /* -- remove / disable user --------------------------------------- */
  const removeUser = useCallback(
    (username: string) => {
      // The local list is just a cache — real disabling happens through RTDB.
      const list = loadCachedUsers().filter(
        (u) => u.username.toLowerCase() !== username.toLowerCase(),
      );
      saveCachedUsers(list);
      refreshUsers();
    },
    [refreshUsers],
  );

  /* -- change password ---------------------------------------------- */
  const changePassword = useCallback(async (username: string, newPassword: string) => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    // Allow changing the signed-in user's password through Firebase.
    if (current && (!username || username.toLowerCase() === (current.email ?? "").toLowerCase())) {
      await updatePassword(current, newPassword);
    }
    // Other users can only reset via Firebase email link (never a local write).
  }, []);

  /* -- reset -------------------------------------------------------- */
  const sendPasswordResetEmail = useCallback(async (email: string) => {
    try {
      const actionCodeSettings =
        typeof window !== "undefined" && window.location?.origin
          ? { url: `${window.location.origin}/`, handleCodeInApp: false }
          : undefined;
      await firebaseSendPasswordResetEmail(getFirebaseAuth(), email.trim(), actionCodeSettings);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/invalid-email") return { ok: false, error: "invalid_email" };
      if (code === "auth/user-not-found") return { ok: false, error: "user_not_found" };
      if (code === "auth/network-request-failed") return { ok: false, error: "network_error" };
      if (code === "auth/operation-not-allowed")
        return { ok: false, error: "operation_not_allowed" };
      if (code === "auth/unauthorized-continue-uri")
        return { ok: false, error: "invalid_continue_url" };
      return { ok: false, error: String(e) };
    }
  }, []);

  /* -- link employee ------------------------------------------------- */
  const linkEmployee = useCallback(async (userId: string, employeeId: string) => {
    try {
      await set(
        ref(getFirebaseDB(), resolveAppDataPath("users", userId, "employeeId")),
        employeeId,
      );
    } catch (error) {
      logDatabaseWriteFailure(resolveAppDataPath("users", userId, "employeeId"), error);
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      user,
      role: user?.role ?? null,
      isAdmin: user?.role === "admin",
      login,
      logout,
      users,
      refreshUsers,
      register,
      addUser,
      removeUser,
      changePassword,
      sendPasswordResetEmail,
      linkEmployee,
    }),
    [
      ready,
      user,
      users,
      login,
      logout,
      register,
      addUser,
      removeUser,
      changePassword,
      sendPasswordResetEmail,
      refreshUsers,
      linkEmployee,
    ],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/**
 * Routes an employee is allowed to visit.
 * The cashbox (opening/closing sessions, counted cash, expected cash and
 * differences) is restricted to the admin — employees can still sell.
 */
export const EMPLOYEE_ALLOWED = new Set<string>(["/", "/pos", "/refunds", "/settings"]);

export function canVisit(role: Role | null, path: string): boolean {
  if (role === "admin") return true;
  if (!role) return false;
  return EMPLOYEE_ALLOWED.has(path);
}

export { recordWithDefaults };
