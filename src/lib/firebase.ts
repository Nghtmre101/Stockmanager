/**
 * Firebase client — Realtime Database + Authentication.
 *
 * The existing app already stores the Firebase project credentials in
 * localStorage under "stock-manager-firebase-config" (editable from
 * Settings → Firebase). We re-use that configuration and additionally
 * remember the Realtime Database URL.
 *
 * Project: abdou-cosmetics
 * RTDB URL: https://abdou-cosmetics-default-rtdb.europe-west1.firebasedatabase.app
 */

import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  isSignInWithEmailLink,
  signInWithEmailLink,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";
import { backupCfg, type FirebaseConfig } from "./backup";

const APP_DATA_ROOT = "app_data";
const SYNC_ROOT = "sync_rooms";

function normalizePathSegments(segments: Array<string | number | undefined | null>): string[] {
  return segments
    .filter(
      (segment): segment is string | number =>
        segment !== undefined && segment !== null && segment !== "",
    )
    .map((segment) => String(segment).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

export function resolveAppDataPath(...segments: Array<string | number | undefined | null>): string {
  const parts = normalizePathSegments(segments);
  return parts.length > 0 ? `${APP_DATA_ROOT}/${parts.join("/")}` : APP_DATA_ROOT;
}

export function resolveSyncPath(...segments: Array<string | number | undefined | null>): string {
  const parts = normalizePathSegments(segments);
  return parts.length > 0 ? `${SYNC_ROOT}/${parts.join("/")}` : SYNC_ROOT;
}

/** Default Firebase configuration for the existing project. */
export const FIREBASE_DEFAULT: Required<
  Pick<
    FirebaseConfig,
    "apiKey" | "authDomain" | "projectId" | "storageBucket" | "appId" | "messagingSenderId"
  >
> & {
  databaseURL: string;
} = {
  apiKey: "AIzaSyBWPXGw8Q-iCLOkRVCN-Zg2Zl5iSusHpso",
  authDomain: "abdou-cosmetics.firebaseapp.com",
  projectId: "abdou-cosmetics",
  storageBucket: "abdou-cosmetics.firebasestorage.app",
  appId: "1:810296996966:web:0cc82627ed408d0845a9a7",
  messagingSenderId: "810296996966",
  databaseURL: "https://abdou-cosmetics-default-rtdb.europe-west1.firebasedatabase.app",
};

const OLD_PLACEHOLDER_KEY = "AIzaSyDEFAULT_PLACEHOLDER_REPLACED_BY_USER_CONFIG";

/** Merge the localStorage config with defaults (local config wins). */
export function getFirebaseConfig(): FirebaseConfig & { databaseURL: string } {
  const stored = backupCfg.firebase.get();
  // Drop a stale placeholder config saved by an older build so the hard-coded
  // real credentials are used instead.
  if (stored.apiKey === OLD_PLACEHOLDER_KEY) {
    delete stored.apiKey;
  }
  return {
    ...FIREBASE_DEFAULT,
    ...stored,
    databaseURL: stored.databaseURL || FIREBASE_DEFAULT.databaseURL,
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;

/** Lazily initialise Firebase. Safe to call before the DOM is ready. */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const cfg = getFirebaseConfig();
  app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    appId: cfg.appId,
    messagingSenderId: cfg.messagingSenderId,
    databaseURL: cfg.databaseURL,
  });
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseDB(): Database {
  if (!db) db = getDatabase(getFirebaseApp());
  return db;
}

/** True when a usable Firebase config (API key) is available. */
export function isFirebaseConfigured(): boolean {
  const cfg = backupCfg.firebase.get();
  const apiKey = cfg.apiKey || FIREBASE_DEFAULT.apiKey;
  return Boolean(apiKey && apiKey !== OLD_PLACEHOLDER_KEY);
}

/**
 * Configure the long-lived persistence used for authentication.
 * - When the user chooses "remember me" we use browser local persistence so they
 *   stay signed-in across app restarts (including while offline).
 * - Otherwise we use session persistence (cleared when the browser closes).
 */
export async function applyAuthPersistence(remember: boolean): Promise<void> {
  const a = getFirebaseAuth();
  await setPersistence(a, remember ? browserLocalPersistence : browserSessionPersistence);
}

/** Complete a passwordless email-link sign-in if the app was opened from one. */
export async function completeEmailLinkSignIn(): Promise<boolean> {
  const a = getFirebaseAuth();
  if (typeof window !== "undefined" && isSignInWithEmailLink(a, window.location.href)) {
    let email = window.localStorage.getItem("firebase-email-for-sign-in");
    if (!email) {
      email = window.prompt("Please confirm the email used for the sign-in link:") ?? "";
    }
    if (!email) return false;
    await signInWithEmailLink(a, email, window.location.href);
    window.localStorage.removeItem("firebase-email-for-sign-in");
    return true;
  }
  return false;
}
