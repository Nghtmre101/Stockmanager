import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Minus, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  saleHasRefund,
  saleNetTotal,
  saleRefundRatio,
  saleStatusKey,
  type SaleLine,
} from "@/lib/db";
import { invoiceHTML, printHTML, receiptHTML } from "@/lib/print";
import { EmptyState } from "@/components/empty-state";
import { Btn, Modal, StatCard, Th } from "@/components/ui-kit";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refunds — Stock Manager" },
      {
        name: "description",
        content: "Review sales history, process refunds, and print receipts from returned tickets.",
      },
      { property: "og:title", content: "Refunds — Stock Manager" },
      {
        property: "og:description",
        content: "All completed sales and refunds with easy search and safe processing.",
      },
    ],
  }),
  component: Refunds,
});

const safeText = (value: unknown) => String(value ?? "");
const safeTextLower = (value: unknown) => safeText(value).toLowerCase();
const formatDate = (date?: string) => safeText(date).slice(0, 10);
const formatDateTime = (date?: string) => safeText(date).slice(0, 16).replace("T", " ");

/** Quantity of a sale line that can still be refunded. */
const refundableQty = (line: SaleLine) => Math.max(0, line.qty - (line.refundedQty ?? 0));

function Refunds() {
  const { t, lang } = useApp();
  const money = useMoney();
  const { db, refundSale } = useStore();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const allSales = useMemo(
    () =>
      [...db.sales]
        .filter((sale) => sale.status === "done" || sale.status === "returned")
        .sort((a, b) => safeText(b.date).localeCompare(safeText(a.date))),
    [db.sales],
  );

  const selectedSale = useMemo(
    () => allSales.find((sale) => sale.id === selectedId) ?? null,
    [allSales, selectedId],
  );

  const refundTarget = useMemo(
    () => allSales.find((sale) => sale.id === refundId) ?? null,
    [allSales, refundId],
  );

  const filteredSales = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, "");
    if (!term) return allSales;
    return allSales.filter((sale) => {
      const customer = db.customers.find((c) => c.id === sale.customerId);
      return (
        String(sale.no).includes(term) ||
        safeTextLower(sale.id).includes(term) ||
        safeTextLower(customer?.name).includes(term) ||
        safeTextLower(sale.status).includes(term) ||
        safeTextLower(sale.date).includes(term) ||
        (sale.lines ?? []).some((line) => safeTextLower(line.name).includes(term))
      );
    });
  }, [allSales, db.customers, q]);

  const fullyReturned = (sale: (typeof allSales)[number]) =>
    sale.status === "returned" || saleRefundRatio(sale) >= 1;

  const doRefund = () => {
    if (!refundTarget || fullyReturned(refundTarget)) return;
    const lines = Object.entries(picks)
      .map(([productId, qty]) => ({ productId, qty }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) return;
    refundSale(refundTarget.id, lines, user?.name, note.trim() || undefined);
    setRefundId(null);
    setPicks({});
    setNote("");
    setSelectedId(null);
    setQ("");
  };

  const openRefund = (saleId: string) => {
    const sale = allSales.find((s) => s.id === saleId);
    if (!sale || fullyReturned(sale)) return;
    // Start with every refundable line set to 1 — the user then sets quantities.
    const initial: Record<string, number> = {};
    for (const line of sale.lines ?? []) {
      if (refundableQty(line) > 0) initial[line.productId] = 1;
    }
    setPicks(initial);
    setNote("");
    setRefundId(saleId);
  };

  const pickTotal = useMemo(() => {
    if (!refundTarget) return 0;
    return (refundTarget.lines ?? []).reduce((sum, line) => {
      const picked = picks[line.productId] ?? 0;
      if (picked <= 0) return sum;
      return sum + picked * line.price - line.discount * (picked / line.qty);
    }, 0);
  }, [refundTarget, picks]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("sales_tab")}
          value={money(allSales.reduce((sum, sale) => sum + saleNetTotal(sale), 0))}
          tone="primary"
        />
        <StatCard
          label={t("refund")}
          value={db.refunds.length.toString()}
          tone="warning"
        />
        <StatCard
          label={t("st_returned")}
          value={money(allSales.reduce((sum, sale) => sum + (sale.total - saleNetTotal(sale)), 0))}
          tone="danger"
        />
      </div>

      <div className="surface-card p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search_ph")}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="overflow-x-auto surface-card">
        {filteredSales.length === 0 ? (
          <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <Th cols={[t("invoice_no"), t("customer_name"), t("amount"), t("status"), t("date"), ""]} />
            <tbody>
              {filteredSales.map((sale, index) => {
                const customer = db.customers.find((c) => c.id === sale.customerId);
                const active = selectedSale?.id === sale.id;
                const returned = fullyReturned(sale);
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
                    <td className="px-3 py-2.5 font-bold">{customer?.name || "—"}</td>
                    <td className="px-3 py-2.5 font-mono font-black text-success">{money(saleNetTotal(sale))}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black", badge)}>
                        {t(`st_${statusKey}` as any)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatDate(sale.date)}</td>
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
                        <button
                          type="button"
                          disabled={returned}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!returned) openRefund(sale.id);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition-colors",
                            returned
                              ? "cursor-not-allowed bg-secondary text-muted-foreground opacity-60"
                              : "bg-destructive/10 text-destructive hover:bg-destructive/20",
                          )}
                        >
                          <Trash2 className="h-4 w-4" /> {t("refund")}
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

      {selectedSale ? (
        <div className="surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{t("invoice_no")} #{selectedSale.no}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedSale.lines ?? []).length} {t("items_count")} · {formatDateTime(selectedSale.date)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-black",
                  selectedSale.status === "done" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                )}
              >
                {t(`st_${saleStatusKey(selectedSale)}` as any)}
              </span>
              <Btn tone="muted" onClick={() => printHTML(receiptHTML(selectedSale, db, lang))}>
                <Printer className="h-4 w-4" /> {t("receipt")}
              </Btn>
              <Btn tone="accent" onClick={() => printHTML(invoiceHTML(selectedSale, db, lang))}>
                <FileText className="h-4 w-4" /> {t("invoice")}
              </Btn>
              {!fullyReturned(selectedSale) && (
                <Btn tone="danger" onClick={() => openRefund(selectedSale.id)}>
                  <Trash2 className="h-4 w-4" /> {t("refund")}
                </Btn>
              )}
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
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <Th cols={[t("name"), t("items_count"), t("sell_price"), t("amount")]} />
              <tbody>
                {(selectedSale.lines ?? []).map((line, index) => {
                  const refunded = line.refundedQty ?? 0;
                  const remaining = refundableQty(line);
                  return (
                    <tr key={`${line.productId}-${index}`} className={index % 2 ? "bg-secondary/40" : undefined}>
                      <td className="px-3 py-2.5 font-bold">{line.name}</td>
                      <td className="px-3 py-2.5 font-mono">
                        {line.qty}
                        {refunded > 0 && (
                          <span className="ml-1 text-[10px] font-black text-destructive">
                            -{refunded}
                          </span>
                        )}
                        {remaining > 0 && (
                          <span className="ml-1 text-[10px] font-black text-success">
                            +{remaining}
                          </span>
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

          {saleHasRefund(selectedSale) && (
            <div className="mt-4 rounded-2xl border border-border bg-card p-3">
              <p className="mb-2 text-xs font-black text-muted-foreground">{t("history")}</p>
              {db.refunds
                .filter((r) => r.saleId === selectedSale.id)
                .map((r) => (
                  <div key={r.id} className="rounded-xl bg-secondary/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        {formatDateTime(r.date)} {r.user ? `· ${r.user}` : ""}
                      </span>
                      <span className="font-mono text-xs font-black text-destructive">
                        {t("refund")}: {money(r.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {(r.lines ?? []).map((line, i) => (
                        <div key={i} className="flex justify-between gap-2 text-xs">
                          <span className="font-bold">
                            {line.name} <span className="text-muted-foreground">×{line.qty}</span>
                          </span>
                          <span className="font-mono font-black">{money(line.refunded)}</span>
                        </div>
                      ))}
                    </div>
                    {r.note && <p className="mt-1 text-xs italic text-muted-foreground">{r.note}</p>}
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : null}

      <Modal open={!!refundTarget} onClose={() => { setRefundId(null); setPicks({}); }} title={t("refund")}>
        {refundTarget && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("invoice_no")} #{refundTarget.no} · {money(refundTarget.total)}
            </p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              {t("refund_hint")}
            </p>

            <div className="mt-3 space-y-2 rounded-xl bg-secondary/50 p-3">
              {(refundTarget.lines ?? []).map((line, i) => {
                const remaining = refundableQty(line);
                const picked = Math.min(picks[line.productId] ?? 0, remaining);
                const disabled = remaining <= 0;
                return (
                  <div
                    key={`${line.productId}-${i}`}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card p-2",
                      disabled && "opacity-50",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{line.name}</p>
                      <p className="text-[11px] font-bold text-muted-foreground">
                        {money(line.price)} · {t("qty")}: {line.qty}
                        {remaining < line.qty && (
                          <span className="ml-1 text-destructive">
                            ({remaining} {t("refund").toLowerCase()})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={disabled || picked <= 0}
                        onClick={() =>
                          setPicks((p) => ({ ...p, [line.productId]: Math.max(0, picked - 1) }))
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-secondary-foreground disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center font-mono text-sm font-black">{picked}</span>
                      <button
                        type="button"
                        disabled={disabled || picked >= remaining}
                        onClick={() =>
                          setPicks((p) => ({ ...p, [line.productId]: Math.min(remaining, picked + 1) }))
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm font-black">{t("total")}</span>
              <span className="font-mono text-sm font-black text-destructive">{money(pickTotal)}</span>
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("note")}
              className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground focus:border-primary"
            />

            <div className="flex gap-2 pt-4">
              <Btn tone="danger" className="flex-1 py-3" disabled={pickTotal <= 0} onClick={doRefund}>
                {t("confirm")}
              </Btn>
              <Btn tone="muted" className="flex-1 py-3" onClick={() => { setRefundId(null); setPicks({}); }}>
                {t("cancel")}
              </Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}