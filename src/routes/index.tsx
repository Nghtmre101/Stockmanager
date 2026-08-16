import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  ClipboardList,
  DollarSign,
  Layers,
  LineChart,
  Receipt,
  ShoppingCart,
  Star,
  Truck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useApp, useMoney, type TKey } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  customerDebt,
  expiringItems,
  isSameDay,
  lowStockItems,
  round2,
  saleDue,
  saleProfit,
  stockValue,
} from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { StatCard, Th } from "@/components/ui-kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stock Manager — Store Dashboard" },
      {
        name: "description",
        content:
          "Daily, monthly and yearly sales, profit, debts, stock alerts, latest invoices and top customers — offline.",
      },
      { property: "og:title", content: "Stock Manager — Store Dashboard" },
      {
        property: "og:description",
        content: "Sales, profit, debts, stock alerts and top customers in one panel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const shortcuts: {
  key: TKey;
  icon: React.ElementType;
  to: string;
  adminOnly?: boolean;
}[] = [
  { key: "sell", icon: ShoppingCart, to: "/pos" },
  { key: "buy", icon: Truck, to: "/purchases", adminOnly: true },
  { key: "items", icon: Boxes, to: "/products" },
  { key: "categories", icon: Layers, to: "/categories", adminOnly: true },
  { key: "customers", icon: UsersRound, to: "/customers", adminOnly: true },
  { key: "suppliers", icon: Truck, to: "/suppliers" },
  { key: "staff", icon: BriefcaseBusiness, to: "/staff" },
  { key: "nav_cashbox", icon: Wallet, to: "/cashbox", adminOnly: true },
  { key: "stocktake", icon: ClipboardList, to: "/products" },
  { key: "stats", icon: LineChart, to: "/summary", adminOnly: true },
  { key: "capital", icon: DollarSign, to: "/settings" },
];

function Dashboard() {
  const { t } = useApp();
  const money = useMoney();
  const { db } = useStore();
  const { isAdmin } = useAuth();
  const canSeeProfit = isAdmin;
  const visibleShortcuts = shortcuts.filter((s) => !s.adminOnly || isAdmin);

  const m = useMemo(() => {
    const now = new Date();
    const done = db.sales.filter((s) => s.status === "done");
    const today = done.filter((s) => isSameDay(s.date, now));
    const month = done.filter((s) => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const year = done.filter((s) => new Date(s.date).getFullYear() === now.getFullYear());
    const sum = (arr: typeof done) => round2(arr.reduce((a, s) => a + s.total, 0));
    const profit = round2(done.reduce((a, s) => a + saleProfit(s), 0));
    const debts = round2(db.customers.reduce((a, c) => a + Math.max(0, customerDebt(db, c.id)), 0));
    const expenses = round2(db.expenses.reduce((a, e) => a + e.amount, 0));

    const spark = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - i));
      const v = done.filter((s) => isSameDay(s.date, day)).reduce((a, s) => a + s.total, 0);
      return { label: day.toLocaleDateString("fr-FR", { weekday: "short" }), value: round2(v) };
    });

    const top = db.customers
      .map((c) => ({
        c,
        total: round2(
          done.filter((s) => s.customerId === c.id).reduce((a, s) => a + s.total, 0),
        ),
        debt: customerDebt(db, c.id),
      }))
      .filter((r) => r.total > 0 || r.debt > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      today: sum(today),
      month: sum(month),
      year: sum(year),
      profit,
      debts,
      expenses,
      spark,
      top,
      latest: [...done].sort((a, b) => b.no - a.no).slice(0, 6),
    };
  }, [db]);

  const low = lowStockItems(db);
  const expiring = expiringItems(db);
  const peak = Math.max(1, ...m.spark.map((s) => s.value));

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl brand-gradient p-5 glow-shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold text-primary-foreground/80">
              <Star className="h-4 w-4" /> {t("today_sales")}
            </p>
            <p className="mt-2 truncate text-3xl font-black text-primary-foreground lg:text-4xl">
              {money(m.today)}
            </p>
          </div>
          <div className="flex gap-6">
            <HeroFig label={t("month_sales")} value={money(m.month)} />
            <HeroFig label={t("year_sales")} value={money(m.year)} />
          </div>
        </div>
        <div className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-primary-foreground/10" />
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {canSeeProfit && (
          <StatCard label={t("net_profit")} value={money(m.profit)} tone="success" />
        )}
        <StatCard label={t("debts")} value={money(m.debts)} tone="warning" />
        {canSeeProfit && (
          <StatCard label={t("total_expenses")} value={money(m.expenses)} tone="danger" />
        )}
        <StatCard label={t("stock_value")} value={money(stockValue(db))} icon={<Boxes className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="surface-card p-4">
          <h2 className="mb-3 text-sm font-black">{t("last7")}</h2>
          {m.spark.every((s) => s.value === 0) ? (
            <EmptyState title={t("empty_chart")} hint={t("empty_table_hint")} />
          ) : (
            <div className="flex h-40 items-end gap-2">
              {m.spark.map((s) => (
                <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {s.value ? Math.round(s.value) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-lg brand-gradient transition-all"
                    style={{ height: `${Math.max(4, (s.value / peak) * 110)}px` }}
                  />
                  <span className="text-[10px] font-bold">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="surface-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
            <AlertTriangle className="h-4 w-4 text-warning" /> {t("alerts")}
          </h2>
          {low.length + expiring.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-muted-foreground">{t("no_results")}</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {low.map((p) => (
                <p key={p.id} className="flex justify-between gap-2 text-xs font-bold">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-destructive">
                    {p.stock <= 0 ? t("out_of_stock") : `${t("low_stock")}: ${p.stock}`}
                  </span>
                </p>
              ))}
              {expiring.map((p) => (
                <p key={`e-${p.id}`} className="flex justify-between gap-2 text-xs font-bold">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 font-mono text-warning">{p.expiry}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="overflow-x-auto surface-card">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-black">
              <Receipt className="h-4 w-4" /> {t("latest_invoices")}
            </h2>
            <Link to="/pos" className="text-xs font-black text-primary">
              {t("view_all")}
            </Link>
          </div>
          {m.latest.length === 0 ? (
            <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <Th cols={[t("invoice_no"), t("date"), t("customer_name"), t("amount"), t("status")]} />
              <tbody>
                {m.latest.map((s, i) => {
                  const due = saleDue(s);
                  const label = due <= 0 ? t("st_paid") : s.paid > 0 ? t("st_partial") : t("st_unpaid");
                  const tone =
                    due <= 0
                      ? "bg-success/15 text-success"
                      : s.paid > 0
                        ? "bg-warning/20 text-warning"
                        : "bg-destructive/15 text-destructive";
                  return (
                    <tr key={s.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                      <td className="px-3 py-2 font-mono font-black">#{s.no}</td>
                      <td className="px-3 py-2 text-xs">
                        {new Date(s.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-3 py-2 truncate text-xs font-bold">
                        {db.customers.find((c) => c.id === s.customerId)?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono font-black text-primary">
                        {s.total.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${tone}`}>
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="overflow-x-auto surface-card">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-black">
              <UsersRound className="h-4 w-4" /> {t("top_customers")}
            </h2>
            <Link to="/customers" className="text-xs font-black text-primary">
              {t("view_all")}
            </Link>
          </div>
          {m.top.length === 0 ? (
            <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
          ) : (
            <table className="w-full min-w-[380px] text-sm">
              <Th cols={[t("customer_name"), t("revenue"), t("debt")]} />
              <tbody>
                {m.top.map((r, i) => (
                  <tr key={r.c.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                    <td className="px-3 py-2 truncate font-bold">{r.c.name}</td>
                    <td className="px-3 py-2 font-mono">{r.total.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-destructive">{r.debt.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 px-1 text-sm font-extrabold text-muted-foreground">{t("main_menu")}</h2>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-11">
          {visibleShortcuts.map(({ key, icon: Icon, to }) => (
            <Link
              key={key}
              to={to}
              className="group flex flex-col items-center gap-2 rounded-2xl p-2 transition hover:bg-accent"
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground transition group-hover:scale-105 group-active:scale-95">
                <Icon className="h-5 w-5" />
              </span>
              <span className="line-clamp-2 text-center text-[11px] font-bold">{t(key)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroFig({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-bold text-primary-foreground/70">{label}</p>
      <p className="truncate text-lg font-black text-primary-foreground">{value}</p>
    </div>
  );
}
