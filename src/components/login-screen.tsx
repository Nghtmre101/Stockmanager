import { useEffect, useState } from "react";
import {
  LayoutGrid,
  Eye,
  EyeOff,
  LogIn,
  KeyRound,
  ShieldCheck,
  Volume2,
  VolumeX,
  UserPlus,
} from "lucide-react";
import { useAuth, ADMIN_CREDENTIALS } from "@/lib/auth";
import { useApp } from "@/lib/app-context";
import { sfx } from "@/lib/sfx";

type Mode = "login" | "signup";

export function LoginScreen() {
  const { login, register, sendPasswordResetEmail, ready } = useAuth();
  const { t, toggleLang, shuffleTheme } = useApp();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(!sfx.isEnabled());

  useEffect(() => {
    sfx.tap();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await login(username, password);
    setBusy(false);
    if (r.ok) {
      sfx.success();
    } else {
      sfx.error();
      setError(
        r.error === "user_not_found"
          ? "Unknown user."
          : r.error === "bad_password"
            ? "Wrong password."
            : r.error || "Sign in failed.",
      );
    }
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await register({
      username: signupUsername,
      email: signupEmail,
      password: signupPassword,
      name: signupName || undefined,
    });
    setBusy(false);
    if (r.ok) {
      sfx.success();
      // The account is created and the user is signed in automatically by
      // Firebase — AuthGate will switch to the app.
    } else {
      sfx.error();
      setError(
        r.error === "missing_username"
          ? "Choose a username."
          : r.error === "invalid_username"
            ? "Username can only use letters, numbers, dots, dashes and underscores."
            : r.error === "username_taken"
              ? "That username is already taken."
              : r.error === "invalid_email"
                ? "Enter a valid email address."
                : r.error === "password_too_short"
                  ? "Password must be at least 6 characters."
                  : r.error === "duplicate"
                    ? "An account with that email already exists."
                    : r.error === "network_error"
                      ? "Network error — check your connection and try again."
                      : r.error || "Sign up failed.",
      );
    }
  };

  const signInAsAdmin = async () => {
    setError(null);
    setBusy(true);
    sfx.click();
    // Try signing in with the hard-coded admin credentials first.
    let r = await login(ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
    // If the admin account doesn't exist yet (bad_password / user-not-found),
    // auto-provision it so the hard-coded credentials always work.
    if (!r.ok) {
      const created = await register({
        username: ADMIN_CREDENTIALS.username,
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
        name: "Hamid",
      });
      if (!created.ok) {
        // Email may already be in use but sign-in failed for another reason —
        // surface the error rather than looping.
        setBusy(false);
        sfx.error();
        setError(created.error || "Admin sign-in failed.");
        return;
      }
      // Account just created — Firebase already signed us in automatically.
      r = { ok: true };
    }
    setBusy(false);
    if (r.ok) {
      sfx.success();
    } else {
      sfx.error();
      setError(r.error || "Admin sign-in failed.");
    }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    const r = await sendPasswordResetEmail(resetEmail);
    if (r.ok) {
      sfx.success();
      setResetMsg("If that email exists in Firebase Auth, a reset link has been sent.");
    } else {
      sfx.error();
      setResetMsg(
        r.error === "invalid_email"
          ? "Enter a valid email address."
          : r.error === "user_not_found"
            ? "If that email exists in Firebase Auth, a reset link will be sent."
            : r.error === "network_error"
              ? "Network error — check your connection and try again."
              : r.error === "operation_not_allowed"
                ? "Email/password sign-in is not enabled in Firebase Authentication."
                : r.error === "invalid_continue_url"
                  ? "The reset link configuration is invalid. Check the Firebase auth settings."
                  : `Could not send: ${r.error}`,
      );
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, oklch(0.7 0.2 260 / 0.35), transparent 60%), radial-gradient(900px 500px at 110% 110%, oklch(0.7 0.2 20 / 0.3), transparent 60%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 brand-gradient opacity-15" />

      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button
          onClick={() => {
            const v = !sfx.isEnabled();
            sfx.setEnabled(v);
            setMuted(!v);
            if (v) sfx.tap();
          }}
          className="rounded-full bg-card/70 p-2 backdrop-blur"
          aria-label="Toggle sound"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          onClick={() => {
            sfx.click();
            toggleLang();
          }}
          className="rounded-full bg-card/70 px-3 py-1.5 text-xs font-bold backdrop-blur"
        >
          {t("lang_btn")}
        </button>
        <button
          onClick={() => {
            sfx.click();
            shuffleTheme();
          }}
          className="rounded-full bg-card/70 px-3 py-1.5 text-xs font-bold backdrop-blur"
        >
          {t("theme_btn")}
        </button>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-3xl brand-gradient glow-shadow">
            <LayoutGrid className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight">{t("appName")}</h1>
            <p className="text-xs font-semibold text-muted-foreground">{t("tagline")}</p>
          </div>
        </div>

        {!resetOpen ? (
          <form
            onSubmit={mode === "login" ? onSubmit : onSignup}
            className="w-full space-y-3 rounded-3xl border border-border bg-card/80 p-5 shadow-xl backdrop-blur"
          >
            {/* Tab switcher */}
            <div className="grid grid-cols-2 rounded-xl bg-secondary/60 p-1">
              <button
                type="button"
                onClick={() => {
                  sfx.click();
                  setMode("login");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-black transition-colors ${mode === "login" ? "brand-gradient text-primary-foreground glow-shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LogIn className="h-3.5 w-3.5" /> Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.click();
                  setMode("signup");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-black transition-colors ${mode === "signup" ? "brand-gradient text-primary-foreground glow-shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <UserPlus className="h-3.5 w-3.5" /> Create account
              </button>
            </div>

            {mode === "login" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                    Username or email
                  </span>
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="admin"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                    Password
                  </span>
                  <div className="relative">
                    <input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 pr-10 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                    Username
                  </span>
                  <input
                    autoFocus
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="e.g. ahmed"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                    Email
                  </span>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                    Display name (optional)
                  </span>
                  <input
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    autoComplete="name"
                    placeholder="Ahmed"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
                    Password
                  </span>
                  <div className="relative">
                    <input
                      type={show ? "text" : "password"}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Min 6 characters"
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 pr-10 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  New accounts are created as employees. An administrator can promote you or add
                  more users from Settings.
                </p>
              </>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !ready}
              className="flex w-full items-center justify-center gap-2 rounded-xl brand-gradient px-4 py-3 text-sm font-black text-primary-foreground glow-shadow disabled:opacity-60"
            >
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </button>

            {mode === "login" && (
              <div className="flex items-center justify-between pt-1 text-[11px] font-semibold text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <KeyRound className="h-3 w-3" /> Forgot password?
                </button>
                <span>Login with username or email</span>
              </div>
            )}
          </form>
        ) : (
          <form
            onSubmit={onReset}
            className="w-full space-y-3 rounded-3xl border border-border bg-card/80 p-5 shadow-xl backdrop-blur"
          >
            <p className="text-sm font-black">Reset via email (Firebase)</p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-muted-foreground">Email</span>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {resetMsg && (
              <p className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">{resetMsg}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="flex-1 rounded-xl border border-input px-3 py-2 text-xs font-black"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl brand-gradient px-3 py-2 text-xs font-black text-primary-foreground glow-shadow"
              >
                Send reset link
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-center text-[11px] font-semibold text-muted-foreground">
          {t("offline_note")}
        </p>
      </div>
    </div>
  );
}
