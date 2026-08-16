import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { supplierDebt } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal, StatCard, Th } from "@/components/ui-kit";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Stock Manager" },
      { name: "description", content: "Supplier book with purchase history and outstanding supplier debts." },
      { property: "og:title", content: "Suppliers — Stock Manager" },
      { property: "og:description", content: "Supplier book and outstanding balances." },
    ],
  }),
  component: Suppliers,
});

function Suppliers() {
  const { t } = useApp();
  const money = useMoney();
  const { db, upsertSupplier, removeSupplier, paySupplier } = useStore();
  const [open, setOpen] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", note: "" });

  const total = db.suppliers.reduce((s, x) => s + supplierDebt(db, x.id), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("suppliers")} value={String(db.suppliers.length)} tone="primary" />
        <StatCard label={t("supplier_debt")} value={money(total)} tone="warning" />
        <StatCard label={t("purchases_history")} value={String(db.purchases.length)} />
      </div>

      <div className="flex justify-end">
        <Btn tone="success" onClick={() => { setForm({ name: "", phone: "", note: "" }); setOpen(true); }}>
          <Plus className="h-4 w-4" /> {t("add")}
        </Btn>
      </div>

      <div className="overflow-x-auto surface-card">
        {db.suppliers.length === 0 ? (
          <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <Th cols={[t("name"), t("phone"), t("supplier_debt"), t("note"), t("actions")]} />
            <tbody>
              {db.suppliers.map((s, i) => {
                const debt = supplierDebt(db, s.id);
                return (
                  <tr key={s.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                    <td className="px-3 py-2 font-bold">{s.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.phone || "-"}</td>
                    <td className={`px-3 py-2 font-mono font-black ${debt > 0 ? "text-destructive" : "text-success"}`}>
                      {debt.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.note}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => { setPayFor(s.id); setAmount(String(debt > 0 ? debt : "")); }} className="text-primary">
                          <Wallet className="h-4 w-4" />
                        </button>
                        <button onClick={() => window.confirm(t("delete_confirm")) && removeSupplier(s.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
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

      <Modal open={open} onClose={() => setOpen(false)} title={t("suppliers")}>
        <Field label={t("name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label={t("phone")} inputMode="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label={t("note")} value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
        <Btn tone="success" className="w-full py-3" onClick={() => { if (form.name.trim()) { upsertSupplier(form); setOpen(false); } }}>
          {t("save")}
        </Btn>
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={t("pay_supplier")}>
        <Field label={t("amount")} inputMode="decimal" value={amount} onChange={setAmount} />
        <Btn
          tone="success"
          className="w-full py-3"
          onClick={() => {
            const v = Number(amount.replace(",", ".")) || 0;
            if (payFor && v > 0) paySupplier(payFor, v);
            setPayFor(null);
            setAmount("");
          }}
        >
          {t("confirm")}
        </Btn>
      </Modal>
    </div>
  );
}
