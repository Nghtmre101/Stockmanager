import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  Boxes,
  Clock,
  Home,
  Languages,
  Layers,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  X,
  PieChart,
  Receipt,
  Settings,

  Shuffle,
  ShoppingCart,
  Truck,
  Users,
  UsersRound,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { useApp, useMoney, type Lang, type TKey } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { dayKey, expiringItems, lowStockItems } from "@/lib/db";
import { cn } from "@/lib/utils";
import { canVisit, useAuth, type Role } from "@/lib/auth";
import { sfx } from "@/lib/sfx";
import { SyncStatusButton } from "./sync-status-button";
const LOCALE: Record<Lang, string> = { ar: "ar-DZ", fr: "fr-DZ", en: "en-US" };
const fmtClock = (d: Date, lang: Lang) =>
  d.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDate = (d: Date, lang: Lang) =>
  d.toLocaleDateString(LOCALE[lang], { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

type NavItem = { to: string; key: TKey; icon: React.ElementType; roles: Role[] };

const nav: NavItem[] = [
  { to: "/", key: "nav_home", icon: Home, roles: ["admin", "employee"] },
  { to: "/pos", key: "nav_pos", icon: ShoppingCart, roles: ["admin", "employee"] },
  { to: "/products", key: "nav_products", icon: Boxes, roles: ["admin", "employee"] },
  { to: "/categories", key: "nav_categories", icon: Layers, roles: ["admin"] },
  { to: "/purchases", key: "nav_purchases", icon: Truck, roles: ["admin"] },
  { to: "/cashbox", key: "nav_cashbox", icon: Wallet, roles: ["admin"] },
  { to: "/sales-history", key: "nav_sales_history", icon: Receipt, roles: ["admin", "employee"] },
  { to: "/refunds", key: "nav_refunds", icon: ArrowLeftRight, roles: ["admin", "employee"] },
  { to: "/customers", key: "nav_customers", icon: UsersRound, roles: ["admin"] },
  { to: "/suppliers", key: "nav_suppliers", icon: Truck, roles: ["admin", "employee"] },
  { to: "/staff", key: "nav_staff", icon: Users, roles: ["admin", "employee"] },
  { to: "/desk", key: "nav_desk", icon: Clock, roles: ["admin"] },
  { to: "/summary", key: "nav_summary", icon: PieChart, roles: ["admin"] },
  { to: "/settings", key: "nav_settings", icon: Settings, roles: ["admin", "employee"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, lang, toggleLang, shuffleTheme, theme } = useApp();
  const money = useMoney();
  const { db } = useStore();
  const { user, role, logout } = useAuth();

  /* Real notifications pulled from the data, so the bell is actually useful. */
  const todayKey = dayKey(new Date().toISOString());
  const lowStock = lowStockItems(db);
  const expiring = expiringItems(db, 30);
  const refundsToday = db.refunds.filter((r) => dayKey(r.date) === todayKey);
  const cashOpenToday = db.cashSessions.some((s) => dayKey(s.openedAt) === todayKey);
  const notifCount = lowStock.length + expiring.length + refundsToday.length + (cashOpenToday ? 0 : 1);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [muted, setMuted] = useState(!sfx.isEnabled());
  const [moreOpen, setMoreOpen] = useState(false);

  /* Live clock so the cashier can keep track of time while working. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const visibleNav = nav.filter((n) => n.roles.includes((role ?? "employee") as Role));
  const DOCK_PRIMARY = ["/", "/pos", "/products", "/cashbox"];
  const primaryNav = visibleNav.filter((n) => DOCK_PRIMARY.includes(n.to));
  const moreNav = visibleNav.filter((n) => !DOCK_PRIMARY.includes(n.to));
  const allowed = canVisit(role, pathname);

  /* ---- Bottom dock: account for its real height + Android safe area ------
   * The dock is `position: fixed`, so page content needs bottom padding equal
   * to the dock's on-screen footprint. We measure it once and whenever the
   * layout changes (orientation / resize) instead of hard-coding a magic
   * number that breaks on different screen sizes. */
  const dockRef = useRef<HTMLElement>(null);
  const [dockFootprint, setDockFootprint] = useState(0);
  // The dock is visible on every viewport below `lg` (1024px), so the content
  // padding must follow the same breakpoint — not the 768px mobile one.
  const [dockVisible, setDockVisible] = useState(false);

  useEffect(() => {
    const measure = () => {
      setDockVisible(window.innerWidth < 1024);
      const el = dockRef.current;
      if (!el) return;
      const style = getComputedStyle(el);
      const mb = parseFloat(style.marginBottom) || 0;
      // offsetHeight is the visible bar; marginBottom already encodes the
      // safe-area inset, so the sum is exactly what sits above screen bottom.
      setDockFootprint(Math.ceil(el.offsetHeight + mb));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // Re-measure after fonts/layout settle.
    const t = window.setTimeout(measure, 300);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.clearTimeout(t);
    };
  }, []);

  /* The dock slides away while the user scrolls down a long list and comes
     back the moment they scroll up — the usual Android behaviour. */
  const [dockHidden, setDockHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const bottom = y + window.innerHeight >= document.documentElement.scrollHeight - 24;
      const delta = y - lastY.current;
      if (Math.abs(delta) > 6) {
        setDockHidden(delta > 0 && y > 96 && !bottom);
        lastY.current = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---- Android soft keyboard ------------------------------------------
   * When the keyboard opens the visual viewport shrinks but fixed elements
   * (the floating dock / sheets) stay pinned, which showed up as a grey
   * "keyboard skeleton" behind the real keyboard. We detect the keyboard via
   * the visualViewport API and take the floating chrome out of the layout
   * while it is up. */
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewport = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      const open = hidden > 150;
      setKeyboardOpen(open);
      document.body.classList.toggle("keyboard-open", open);
    };
    onViewport();
    vv.addEventListener("resize", onViewport);
    vv.addEventListener("scroll", onViewport);
    return () => {
      vv.removeEventListener("resize", onViewport);
      vv.removeEventListener("scroll", onViewport);
      document.body.classList.remove("keyboard-open");
    };
  }, []);

  // Never keep the dock hidden while the "More" sheet is open.
  useEffect(() => {
    if (moreOpen) setDockHidden(false);
  }, [moreOpen]);




  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 hidden w-64 flex-col gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 lg:flex left-0">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl brand-gradient glow-shadow">
            <LayoutGrid className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold tracking-tight">
              {db.settings.storeName || t("appName")}
            </p>
            <p className="truncate text-xs text-muted-foreground">{t("tagline")}</p>
          </div>
        </div>

        <div className="mb-2 rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-3">
          <p className="font-mono text-2xl font-black tabular-nums text-foreground" dir="ltr">
            {fmtClock(now, lang)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(now, lang)}</p>
        </div>

        {visibleNav.map(({ to, key, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={() => sfx.click()}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                active
                  ? "brand-gradient text-primary-foreground glow-shadow"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <span className="truncate">{t(key)}</span>
            </Link>
          );
        })}

        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs text-muted-foreground">
            <p className="font-black text-foreground">{user?.name || user?.username}</p>
            <p className="mt-0.5 uppercase tracking-wide">{role}</p>
            <span className="mt-1 block font-mono text-[10px] opacity-70">{theme?.name}</span>
          </div>
          <button
            onClick={() => { sfx.tap(); logout(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-xs font-black hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 brand-gradient">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
            <div className="relative flex min-w-0 flex-1 items-center gap-2">
              <button
                onClick={() => setAlertsOpen((v) => !v)}
                className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground"
              >
                <Bell className="h-4.5 w-4.5" />
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-black text-destructive-foreground -right-0.5">
                    {notifCount}
                  </span>
                )}
              </button>

              <p className="truncate text-base font-extrabold text-primary-foreground lg:text-lg">
                {db.settings.storeName || t("appName")}
              </p>

              {alertsOpen && (
                <div className="absolute top-12 z-40 w-72 rounded-2xl border border-border bg-card p-3 shadow-xl left-0">
                  <p className="mb-2 text-xs font-black">{t("notifications")}</p>
                  {notifCount === 0 ? (
                    <p className="py-3 text-xs font-semibold text-muted-foreground">{t("no_results")}</p>
                  ) : (
                    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                      {lowStock.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide text-warning">
                            {t("notif_stock")} ({lowStock.length})
                          </p>
                          {lowStock.slice(0, 8).map((p) => (
                            <p key={p.id} className="flex justify-between gap-2 py-0.5 text-xs font-bold">
                              <span className="truncate">{p.name}</span>
                              <span className="shrink-0 text-destructive">
                                {p.stock <= 0 ? t("out_of_stock") : p.stock}
                              </span>
                            </p>
                          ))}
                        </div>
                      )}
                      {expiring.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide text-warning">
                            {t("notif_expiring")} ({expiring.length})
                          </p>
                          {expiring.slice(0, 8).map((p) => (
                            <p key={p.id} className="flex justify-between gap-2 py-0.5 text-xs font-bold">
                              <span className="truncate">{p.name}</span>
                              <span className="shrink-0 font-mono text-muted-foreground">{p.expiry}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      {refundsToday.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide text-warning">
                            {t("notif_refunds_today")} ({refundsToday.length})
                          </p>
                          {refundsToday.slice(0, 8).map((r) => (
                            <p key={r.id} className="flex justify-between gap-2 py-0.5 text-xs font-bold">
                              <span className="truncate">
                                {r.date.slice(11, 16)} · {r.user}
                              </span>
                              <span className="shrink-0 font-mono">{money(r.total)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      {!cashOpenToday && (
                        <p className="rounded-xl bg-warning/10 px-2 py-1.5 text-xs font-bold text-warning">
                          {t("notif_open_cash")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SyncStatusButton />
              <button
                onClick={() => { const v = !sfx.isEnabled(); sfx.setEnabled(v); setMuted(!v); if (v) sfx.tap(); }}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground"
                aria-label="Toggle sound"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => { sfx.click(); shuffleTheme(); }}
                className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold text-primary-foreground backdrop-blur transition hover:bg-primary-foreground/25 active:scale-95"
              >
                <Shuffle className="h-4 w-4" />
                <span className="hidden sm:inline">{t("theme_btn")}</span>
              </button>
              <button
                onClick={() => { sfx.click(); toggleLang(); }}
                className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold text-primary-foreground backdrop-blur transition hover:bg-primary-foreground/25 active:scale-95"
              >
                <Languages className="h-4 w-4" />
                <span>{t("lang_btn")}</span>
              </button>
              <button
                onClick={() => { sfx.tap(); logout(); }}
                className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold text-primary-foreground backdrop-blur transition hover:bg-primary-foreground/25 active:scale-95"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <main
          className="mx-auto max-w-7xl px-4 pt-4 lg:pb-10"
          style={dockVisible && !keyboardOpen && dockFootprint > 0 ? { paddingBottom: dockFootprint + 24 } : undefined}
        >
          {allowed ? (
            children
          ) : (
            <div className="mx-auto mt-16 max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
              <p className="text-lg font-black">Not available</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your account does not have access to this section. Contact the administrator.
              </p>
              <Link to="/" className="mt-4 inline-flex rounded-xl brand-gradient px-4 py-2 text-xs font-black text-primary-foreground">
                Go home
              </Link>
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom dock */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[2rem] border-t border-border bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
            <div className="grid grid-cols-4 gap-2">
              {moreNav.map(({ to, key, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => { sfx.click(); setMoreOpen(false); }}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[10px] font-bold transition-colors",
                      active ? "bg-accent text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="w-full truncate text-center">{t(key)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        ref={dockRef}
        aria-label="Primary"
        className={cn(
          "fixed inset-x-3 bottom-0 z-40 mb-[calc(env(safe-area-inset-bottom)+0.75rem)] rounded-[2rem] border border-border bg-card/90 shadow-xl backdrop-blur-xl transition-all duration-300 ease-out lg:hidden",
          dockHidden || keyboardOpen
            ? "pointer-events-none translate-y-[150%] opacity-0"
            : "translate-y-0 opacity-100",
        )}
      >
        <div className="grid grid-cols-5 items-end px-1.5 py-2">
          {primaryNav.map(({ to, key, icon: Icon }) => {
            const active = pathname === to && !moreOpen;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => { sfx.click(); setMoreOpen(false); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-full px-0.5 py-1 text-[10px] font-bold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-14 place-items-center rounded-full transition-all duration-200",
                    active ? "bg-accent scale-105" : "scale-100",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="w-full truncate text-center">{t(key)}</span>
              </Link>
            );
          })}

          {moreNav.length > 0 && (
            <button
              onClick={() => { sfx.click(); setMoreOpen((v) => !v); }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-full px-0.5 py-1 text-[10px] font-bold transition-colors",
                moreOpen || moreNav.some((n) => n.to === pathname)
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-14 place-items-center rounded-full transition-all duration-200",
                  (moreOpen || moreNav.some((n) => n.to === pathname))
                    ? "bg-accent scale-105"
                    : "scale-100",
                )}
              >
                {moreOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
              </span>
              <span className="w-full truncate text-center">{t("nav_more")}</span>
            </button>
          )}
        </div>
      </nav>

    </div>
  );
}
