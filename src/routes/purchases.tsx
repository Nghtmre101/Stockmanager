import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Barcode, FileText, Plus, Printer, Save, Trash2 } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { printHTML, purchaseHTML } from "@/lib/print";
import type { Purchase, PurchaseLine } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Th } from "@/components/ui-kit";

export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases & Stock — Stock Manager" },
      {
        name: "description",
        content: "Record supplier invoices, buy/wholesale/sell prices and barcodes for every item.",
      },
      { property: "og:title", content: "Purchases & Stock — Stock Manager" },
      { property: "og:description", content: "Record supplier invoices and item pricing." },
    ],
  }),
  component: Purchases,
});

const emptyDraft = { name: "", qty: "", buy: "", whole: "", sell: "", code: "" };
const num = (v: string) => Number(String(v).replace(",", ".")) || 0;

function Purchases() {
  const { t, lang } = useApp();
  const money = useMoney();
  const { db, addPurchase } = useStore();

  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [supplierId, setSupplierId] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [last, setLast] = useState<Purchase | null>(null);

  const total = useMemo(() => lines.reduce((s, r) => s + r.qty * r.buy, 0), [lines]);
  const canAdd = draft.name.trim() !== "";
  const today = new Date().toISOString().slice(0, 10);

  const addRow = () => {
    if (!canAdd) return;
    setLines((r) => [
      ...r,
      {
        name: draft.name.trim(),
        barcode: draft.code.trim(),
        qty: num(draft.qty) || 1,
        buy: num(draft.buy),
        wholesale: num(draft.whole),
        sell: num(draft.sell),
      },
    ]);
    setDraft(emptyDraft);
  };

  const save = () => {
    if (!lines.length) return;
    const p = addPurchase({
      lines,
      supplierId: supplierId || undefined,
      paid: num(paid) || 0,
      note: note.trim() || undefined,
    });
    setLast(p);
    setLines([]);
    setPaid("");
    setNote("");
  };

  const recent = useMemo(() => db.purchases.slice(-8).reverse(), [db.purchases]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="min-w-0 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 surface-card px-4 py-3 sm:flex sm:justify-between">
          <p className="truncate text-sm font-black">
            {t("date")}: <span className="font-mono">{today}</span>
          </p>
          <p className="shrink-0 text-xs font-bold text-muted-foreground">
            {t("items_count")}: {lines.length}
          </p>
        </div>

        <div className="overflow-x-auto surface-card">
          {lines.length === 0 ? (
            <EmptyState title={t("empty_invoice")} hint={t("empty_invoice_hint")} />
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <Th
                cols={[
                  "#",
                  t("item_name"),
                  t("qty"),
                  t("buy_price"),
                  t("wholesale"),
                  t("sell_price"),
                  t("total"),
                  t("barcode"),
                  "",
                ]}
              />
              <tbody>
                {lines.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className={i % 2 ? "bg-secondary/40" : undefined}>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-bold">{r.name}</td>
                    <td className="px-3 py-2 font-mono">{r.qty}</td>
                    <td className="px-3 py-2 font-mono">{r.buy.toFixed(1)}</td>
                    <td className="px-3 py-2 font-mono">{r.wholesale.toFixed(1)}</td>
                    <td className="px-3 py-2 font-mono">{r.sell.toFixed(1)}</td>
                    <td className="px-3 py-2 font-mono font-black text-primary">
                      {(r.qty * r.buy).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {r.barcode}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        aria-label={t("remove")}
                        onClick={() => setLines((l) => l.filter((_, k) => k !== i))}
                        className="rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 surface-card px-4 py-3">
          <p className="text-sm font-black">
            {t("invoice_total")}: <span className="text-primary">{money(total)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn tone="success" disabled={!lines.length} onClick={save}>
              <Save className="h-4 w-4" /> {t("save_invoice")}
            </Btn>
            <Btn
              tone="primary"
              onClick={() => {
                setLines([]);
                setPaid("");
                setNote("");
                setLast(null);
              }}
            >
              <FileText className="h-4 w-4" /> {t("new_invoice")}
            </Btn>
            <Btn
              tone="accent"
              disabled={!last}
              onClick={() => last && printHTML(purchaseHTML(last, db, lang))}
            >
              <Printer className="h-4 w-4" /> {t("print_bon")}
            </Btn>
          </div>
        </div>

        <div className="overflow-x-auto surface-card">
          <h2 className="px-4 pt-4 text-sm font-black">{t("purchases_history")}</h2>
          {recent.length === 0 ? (
            <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
          ) : (
            <table className="mt-2 w-full min-w-[560px] text-sm">
              <Th cols={[t("invoice_no"), t("date"), t("supplier"), t("items_count"), t("total"), ""]} />
              <tbody>
                {recent.map((p, i) => (
                  <tr key={p.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                    <td className="px-3 py-2.5 font-mono font-bold">{p.no}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{p.date.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 font-bold">
                      {db.suppliers.find((s) => s.id === p.supplierId)?.name ?? t("none")}
                    </td>
                    <td className="px-3 py-2.5 font-mono">{p.lines.length}</td>
                    <td className="px-3 py-2.5 font-mono font-black text-primary">
                      {money(p.total)}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        aria-label={t("print")}
                        onClick={() => printHTML(purchaseHTML(p, db, lang))}
                        className="rounded-lg p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <aside className="space-y-3 surface-card p-4">
        <h2 className="text-sm font-black">{t("add_item")}</h2>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
            {t("supplier")}
          </span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none"
          >
            <option value="">{t("select_supplier")}</option>
            {db.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={t("item_name")}
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
        />
        <Field
          label={t("qty")}
          value={draft.qty}
          inputMode="numeric"
          onChange={(v) => setDraft((d) => ({ ...d, qty: v }))}
        />
        <Field
          label={t("buy_price")}
          value={draft.buy}
          inputMode="decimal"
          onChange={(v) => setDraft((d) => ({ ...d, buy: v }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={t("wholesale")}
            value={draft.whole}
            inputMode="decimal"
            onChange={(v) => setDraft((d) => ({ ...d, whole: v }))}
          />
          <Field
            label={t("sell_price")}
            value={draft.sell}
            inputMode="decimal"
            onChange={(v) => setDraft((d) => ({ ...d, sell: v }))}
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-input px-3 py-2">
          <Barcode className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={draft.code}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            placeholder={t("barcode")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <Btn tone="success" className="w-full py-3 text-sm" disabled={!canAdd} onClick={addRow}>
          <Plus className="h-4 w-4" /> {t("add_item")}
        </Btn>

        <div className="border-t border-border pt-3">
          <Field
            label={t("amount_paid")}
            value={paid}
            inputMode="decimal"
            onChange={setPaid}
          />
          <Field className="mt-2" label={t("note")} value={note} onChange={setNote} />
        </div>
      </aside>
    </div>
  );
}
