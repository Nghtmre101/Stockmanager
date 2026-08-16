import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, FileText, Printer, Receipt, RotateCcw, Search, Users, X } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { saleDue, saleHasRefund, saleNetTotal, saleStatusKey, type SaleLine } from "@/lib/db";
import { invoiceHTML, printHTML, receiptHTML } from "@/lib/print";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Btn, Th } from "@/components/ui-kit";

const safeText = (value: unknown) => String(value ?? "");
const safeTextLower = (value: unknown) => safeText(value).toLowerCase();
const formatDate = (date?: string) => (typeof date === "string" ? date.slice(0, 10) : "—");
const formatDateTime = (date?: string) => (typeof date === "string" ? date.slice(0, 16).replace("T", " ") : "—");

export const Route = createFileRoute("/sales-history")({
  head: () => ({
    meta: [
      { title: "Sales History — Stock Manager" },
      { name: "description", content: "View all transactions grouped by user with totals and activity." },
      { property: "og:title", content: "Sales History — Stock Manager" },
      { property: "og:description", content: "All sales and refunds organized by user and date." },
    ],
  }),
  component: SalesHistory,
});

type Range = "all" | "today" | "7";

function SalesHistory() {
  const { t, lang } = useApp();
  const money = useMoney();
  const { db } = useStore();
  const { isAdmin, user: authUser } = useAuth();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* Employees can only view their own sales — read-only, no edit/delete. */
  const sales = useMemo(
    () =>
      [...db.sales]
        .filter((s) => s.status === "done" || s.status === "returned")
        .filter((s) => isAdmin || s.user === (authUser?.username ?? ""))
        .sort((a, b) => safeText(b.date).localeCompare(safeText(a.date))),
    [db.sales, isAdmin, authUser?.username],
  );

  const customers = useMemo(
    () => new Map(db.customers.map((customer) => [customer.id, customer])),
    [db.customers],
  );

  const inRange = (date: string) => {
    if (range === "all") return true;
    const d = new Date(date ?? "");
    if (Number.isNaN(d.getTime())) return false;
    if (range === "today") return d.toDateString() === new Date().toDateString();
    return d.getTime() >= Date.now() - 7 * 864e5;
  };

  const rangeSales = useMemo(() => sales.filter((s) => inRange(s.date)), [sales, range]);

  const filteredSales = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/^#/, "");
    if (!query) return rangeSales;
    return rangeSales.filter((sale) => {
      const customer = sale.customerId ? customers.get(sale.customerId) : undefined;
      return (
        String(sale.no).includes(query) ||
        String(sale.id).toLowerCase().includes(query) ||
        String(sale.user ?? "").toLowerCase().includes(query) ||
        String(customer?.name ?? "").toLowerCase().includes(query) ||
        String(sale.status ?? "").toLowerCase().includes(query) ||
        String(sale.method ?? "").toLowerCase().includes(query) ||
        String(sale.date ?? "").toLowerCase().includes(query) ||
        (sale.lines ?? []).some((line) => String(line.name ?? "").toLowerCase().includes(query))
      );
    });
  }, [customers, q, rangeSales]);

  /* Revenue only from completed sales — returned tickets are removed. */
  const doneSales = useMemo(() => sales.filter((s) => s.status === "done"), [sales]);
  const returnedCount = useMemo(() => sales.filter((s) => s.status === "returned").length, [sales]);
  /** Money refunded on returned + partially refunded tickets (net of discounts). */
  const returnedTotal = useMemo(
    () => sales.reduce((sum, s) => sum + (s.total - saleNetTotal(s)), 0),
    [sales],
  );

  const summary = useMemo(() => {
    const today = doneSales.filter(
      (s) => new Date(s.date).toDateString() === new Date().toDateString(),
    );
    return {
      count: doneSales.length,
      revenue: doneSales.reduce((sum, s) => sum + saleNetTotal(s), 0),
      todayCount: today.length,
      todayRevenue: today.reduce((sum, s) => sum + saleNetTotal(s), 0),
    };
  }, [doneSales]);

  const totalsByUser = useMemo(() => {
    const map = new Map<string, { user: string; count: number; total: number }>();
    doneSales.forEach((sale) => {
      const existing = map.get(sale.user) ?? { user: sale.user, count: 0, total: 0 };
      existing.count += 1;
      existing.total += saleNetTotal(sale);
      map.set(sale.user, existing);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [doneSales]);

  const selectedSale = useMemo(
    () => sales.find((s) => s.id === selectedId) ?? null,
    [sales, selectedId],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xl font-bold">{t("sales_history")}</p>
            <p className="text-sm text-muted-foreground">
              All completed sales and returns — print the receipt or invoice for any ticket.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="surface-card rounded-2xl px-3 py-2 text-sm font-semibold outline-none"
          >
            <option value="all">All time</option>
            <option value="today">{t("today")}</option>
            <option value="7">Last 7 days</option>
          </select>
          <div className="surface-card flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search_ph")}
              className="min-w-[180px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

    {!isAdmin && (
      <div className="surface-card rounded-2xl border border-primary/30 px-4 py-2 text-xs font-bold text-muted-foreground">
        {t("emp_view_only")}
      </div>
    )}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card rounded-3xl p-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{t("today")}</span>
          </div>
          <p className="mt-3 text-sm font-bold">{summary.todayCount} {t("sales_tab")}</p>
          <p className="mt-1 text-2xl font-black text-foreground">{money(summary.todayRevenue)}</p>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <Receipt className="h-4 w-4" />
            <span>{t("sales_history")}</span>
          </div>
          <p className="mt-3 text-sm font-bold">{summary.count} {t("sales_tab")}</p>
          <p className="mt-1 text-2xl font-black text-foreground">{money(summary.revenue)}</p>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
            <span>{t("refund")}</span>
          </div>
          <p className="mt-3 text-sm font-bold">{returnedCount} {t("refund")}</p>
          <p className="mt-1 text-2xl font-black text-warning">{money(returnedTotal)}</p>
        </div>
      </div>

      {isAdmin && (
        <div className="grid gap-3 lg:grid-cols-3">
          {totalsByUser.map((user) => (
            <div key={user.user} className="surface-card rounded-3xl p-4">
              <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{user.user}</span>
              </div>
              <p className="mt-3 text-sm font-bold">{user.count} {t("sales_tab")}</p>
              <p className="mt-1 text-2xl font-black text-foreground">{money(user.total)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto surface-card rounded-3xl">
        {filteredSales.length === 0 ? (
          <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <Th cols={[t("invoice_no"), t("user"), t("customer_name"), t("items_count"), t("amount"), t("paid_amount"), t("status"), t("date"), t("payment"), ""]} />
            <tbody>
              {filteredSales.map((sale, index) => {
                const customer = sale.customerId ? customers.get(sale.customerId) : undefined;
                const active = selectedSale?.id === sale.id;
                const returned = saleHasRefund(sale);
                const statusKey = saleStatusKey(sale);
                const badge =
                  statusKey === "returned"
                    ? "bg-warning/15 text-warning"
                    : statusKey === "partial"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-success/15 text-success";
                return (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedId(active ? null : sale.id)}
                    className={cn(
                      index % 2 ? "bg-secondary/40" : undefined,
                      active && "bg-primary/10",
                      returned && "opacity-70",
                      "cursor-pointer transition-colors hover:bg-primary/10",
                    )}
                  >
                    <td className="px-3 py-2.5 font-mono font-bold">{sale.no}</td>
                    <td className="px-3 py-2.5 font-bold">{sale.user}</td>
                    <td className="px-3 py-2.5 font-bold">{customer?.name || "—"}</td>
                    <td className="px-3 py-2.5 font-mono">
                      {(sale.lines ?? []).reduce((s, l) => s + (l.qty - (l.refundedQty ?? 0)), 0)}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-black text-success">{money(saleNetTotal(sale))}</td>
                    <td className="px-3 py-2.5 font-mono">{money(sale.paid)}</td>
                    <td className="px-3 py-2.5 text-sm">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-black",
                          badge,
                        )}
                      >
                        {t(`st_${statusKey}` as any)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatDate(sale.date)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs uppercase text-muted-foreground">{safeText(sale.method)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title={t("receipt")}
                          onClick={(e) => {
                            e.stopPropagation();
                            printHTML(receiptHTML(sale, db, lang));
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={t("invoice")}
                          onClick={(e) => {
                            e.stopPropagation();
                            printHTML(invoiceHTML(sale, db, lang));
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent-foreground transition-colors hover:bg-accent/30"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sale detail — line items + print + totals */}
      {selectedSale && (
        <div className="surface-card overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <p className="text-sm font-bold">
                {t("invoice_no")} #{selectedSale.no}
              </p>
              <p className="text-xs text-muted-foreground">
                {safeText(selectedSale.user)} · {formatDateTime(selectedSale.date)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-black",
                  saleStatusKey(selectedSale) === "done" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                )}
              >
                {t(`st_${saleStatusKey(selectedSale)}` as any)}
              </span>
              <Btn
                tone="muted"
                onClick={() => printHTML(receiptHTML(selectedSale, db, lang))}
              >
                <Printer className="h-4 w-4" /> {t("receipt")}
              </Btn>
              <Btn
                tone="accent"
                onClick={() => printHTML(invoiceHTML(selectedSale, db, lang))}
              >
                <FileText className="h-4 w-4" /> {t("invoice")}
              </Btn>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-secondary-foreground"
                title={t("cancel")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <Th cols={[t("name"), t("items_count"), t("sell_price"), t("amount")]} />
              <tbody>
                {(selectedSale.lines ?? []).map((line, index) => {
                  const refunded = line.refundedQty ?? 0;
                  return (
                    <tr key={`${line.productId}-${index}`} className={index % 2 ? "bg-secondary/40" : undefined}>
                      <td className="px-3 py-2.5 font-bold">{line.name}</td>
                      <td className="px-3 py-2.5 font-mono">
                        {line.qty - refunded}
                        {refunded > 0 && (
                          <span className="ml-1 text-[10px] font-black text-destructive">-{refunded}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono">{money(line.price)}</td>
                      <td className="px-3 py-2.5 font-mono font-black">{money(line.qty * line.price - line.discount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border bg-secondary/30 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs font-bold text-muted-foreground">Sub-total</p>
              <p className="font-mono font-black">{money(selectedSale.subtotal)}</p>
            </div>
            {selectedSale.discount > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("discount")}</p>
                <p className="font-mono font-black text-destructive">- {money(selectedSale.discount)}</p>
              </div>
            )}
            {selectedSale.tva > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground">TVA</p>
                <p className="font-mono font-black">{money(selectedSale.tva)}</p>
              </div>
            )}
            {selectedSale.stamp > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground">{t("stamp_duty")}</p>
                <p className="font-mono font-black">{money(selectedSale.stamp)}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-muted-foreground">{t("invoice_total")}</p>
              <p className="font-mono font-black text-success">{money(saleNetTotal(selectedSale))}</p>
              {saleHasRefund(selectedSale) && (
                <p className="mt-1 text-[10px] font-black text-destructive">
                  -{money(selectedSale.total - saleNetTotal(selectedSale))} {t("refund").toLowerCase()}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground">{t("paid_amount")}</p>
              <p className="font-mono font-black">{money(selectedSale.paid)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground">{t("remaining")}</p>
              <p className={cn("font-mono font-black", saleDue(selectedSale) > 0 ? "text-destructive" : "text-success")}>
                {money(saleDue(selectedSale))}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground">{t("payment")}</p>
              <p className="font-mono font-black uppercase">{selectedSale.method}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}