import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis } from "recharts";
import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { saleNetTotal } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Financial Summary — Stock Manager" },
      {
        name: "description",
        content: "Net profit, sales, expenses and damage losses with daily profit charts.",
      },
      { property: "og:title", content: "Financial Summary — Stock Manager" },
      { property: "og:description", content: "Net profit, sales and expenses at a glance." },
    ],
  }),
  component: Summary,
});

const DAY = 864e5;

function Summary() {
  const { t } = useApp();
  const money = useMoney();
  const { db } = useStore();

  /** Last 30 days of real activity, computed once per data change. */
  const { totalSales, totalExpenses, totalLosses, damages, profitSeries } = useMemo(() => {
    const since = Date.now() - 29 * DAY;
    const within = (iso: string) => new Date(iso).getTime() >= since;
    const sales = db.sales.filter((s) => s.status === "done" && within(s.date));
    const exp = db.expenses.filter((e) => within(e.date));
    const dmg = db.damages.filter((d) => within(d.date));

    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) byDay.set(new Date(Date.now() - i * DAY).toISOString().slice(0, 10), 0);
    for (const s of sales) {
      const k = s.date.slice(0, 10);
      if (!byDay.has(k)) continue;
      const margin = s.lines.reduce(
        (a, l) => a + (l.price - l.cost) * (l.qty - (l.refundedQty ?? 0)),
        0,
      );
      byDay.set(k, (byDay.get(k) ?? 0) + margin);
    }
    for (const e of exp) {
      const k = e.date.slice(0, 10);
      if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) - e.amount);
    }

    return {
      totalSales: sales.reduce((a, s) => a + saleNetTotal(s), 0),
      totalExpenses: exp.reduce((a, e) => a + e.amount, 0),
      totalLosses: dmg.reduce((a, d) => a + d.loss, 0),
      damages: [...dmg].reverse(),
      profitSeries: [...byDay].map(([day, value]) => ({ day: day.slice(5), value: Number(value.toFixed(2)) })),
    };
  }, [db.sales, db.expenses, db.damages]);

  const netProfit = totalSales - totalExpenses - totalLosses;
  const base = totalExpenses + totalLosses + Math.max(netProfit, 0);
  const share = (n: number) => (base > 0 ? Number(((n / base) * 100).toFixed(1)) : 0);
  const pie = [
    { name: t("expenses"), value: share(totalExpenses) },
    { name: t("losses"), value: share(totalLosses) },
    { name: t("net_profit"), value: share(Math.max(netProfit, 0)) },
  ];
  const hasPie = base > 0;
  const from = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 surface-card px-4 py-2.5">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs font-bold">{from} — {to}</span>
      </div>

      <section className="rounded-3xl brand-gradient p-5 glow-shadow">
        <p className="text-xs font-bold text-primary-foreground/80">
          {t("net_profit")} ({t("last30")})
        </p>
        <p className="mt-2 truncate text-3xl font-black text-primary-foreground lg:text-4xl">
          {money(netProfit)}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Row label={t("total_expenses")} value={money(totalExpenses)} tone="destructive" down />
        <Row label={t("total_sales")} value={money(totalSales)} tone="primary" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-black">{t("daily_profit")}</h2>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold">
              {t("last30")}
            </span>
          </div>
          <div className="h-56">
            {profitSeries.length === 0 ? (
              <EmptyState compact title={t("empty_chart")} />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profitSeries}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} axisLine={false} tickLine={false} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="var(--success)" />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="surface-card p-4">
          <h2 className="mb-3 text-sm font-black">{t("net_profit")} / {t("expenses")}</h2>
          <div className="h-56">
            {!hasPie ? (
              <EmptyState compact title={t("empty_chart")} />
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {["var(--success)", "var(--warning)", "var(--primary)"].map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            )}
          </div>
          <ul className="space-y-1 text-xs font-bold">
            {pie.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: ["var(--success)", "var(--warning)", "var(--primary)"][i],
                    }}
                  />
                  {p.name}
                </span>
                <span className="font-mono">{p.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto surface-card">
        {damages.length === 0 ? (
          <EmptyState title={t("damage_details")} hint={t("empty_table_hint")} />
        ) : (
        <table className="w-full min-w-[520px] text-sm">
          <thead className="brand-gradient text-primary-foreground">
            <tr>
              {[t("date"), t("items"), t("qty"), t("losses"), t("reason")].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-black">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {damages.map((d, i) => (
              <tr key={d.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                <td className="px-3 py-2.5 font-mono text-xs">{d.date.slice(0, 10)}</td>
                <td className="px-3 py-2.5 font-bold">{d.item}</td>
                <td className="px-3 py-2.5 font-mono">{d.qty}</td>
                <td className="px-3 py-2.5 font-mono font-black text-destructive">
                  {d.loss.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  down,
}: {
  label: string;
  value: string;
  tone: "destructive" | "primary";
  down?: boolean;
}) {
  const { t } = useApp();
  const bar = tone === "destructive" ? "bg-destructive" : "bg-primary";

  return (
    <div className="relative overflow-hidden surface-card p-4">
      <span className={`absolute inset-y-0 w-1.5 left-0  ${bar}`} />
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-black">{value}</p>
      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">
        {down ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
        {t("last30")}
      </span>
    </div>
  );
}
