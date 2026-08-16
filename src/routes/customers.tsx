import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Plus, Trash2, Wallet } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { customerDebt } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal, StatCard, Th, Toggle } from "@/components/ui-kit";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers & Credit — Stock Manager" },
      {
        name: "description",
        content: "Customer book with phone numbers, wholesale pricing and the credit (karti) ledger.",
      },
      { property: "og:title", content: "Customers & Credit — Stock Manager" },
      { property: "og:description", content: "Customer book and credit ledger." },
    ],
  }),
  component: Customers,
});

function Customers() {
  const { t } = useApp();
  const money = useMoney();
  const { db, upsertCustomer, removeCustomer, payDebt } = useStore();
  const [open, setOpen] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState({ id: "", name: "", phone: "", note: "", wholesale: false, creditLimit: "" });

  const totalDebt = db.customers.reduce((s, c) => s + customerDebt(db, c.id), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("customers")} value={String(db.customers.length)} tone="primary" />
        <StatCard label={t("debts")} value={money(totalDebt)} tone="warning" />
        <StatCard label={t("total_sales")} value={money(db.sales.filter((s) => s.status === "done").reduce((s, x) => s + x.total, 0))} />
      </div>

      <div className="flex justify-end">
        <Btn tone="success" onClick={() => { setForm({ id: "", name: "", phone: "", note: "", wholesale: false, creditLimit: "" }); setOpen(true); }}>
          <Plus className="h-4 w-4" /> {t("new_customer")}
        </Btn>
      </div>

      <div className="overflow-x-auto surface-card">
        {db.customers.length === 0 ? (
          <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
        ) : (
          <table className="w-full min-w-[620px] text-sm">
            <Th cols={[t("name"), t("phone"), t("debt"), t("points"), t("credit_limit"), t("note"), t("actions")]} />
            <tbody>
              {db.customers.map((c, i) => {
                const debt = customerDebt(db, c.id);
                return (
                  <tr key={c.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                    <td className="px-3 py-2 font-bold">
                      {c.name} {c.wholesale ? <span className="text-[10px] text-primary">({t("wholesale")})</span> : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-primary">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </a>
                      ) : "-"}
                    </td>
                    <td className={`px-3 py-2 font-mono font-black ${debt > 0 ? "text-destructive" : "text-success"}`}>
                      {debt.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-black text-primary">{c.points ?? 0}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.creditLimit || "-"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.note}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => { setPayFor(c.id); setAmount(String(debt > 0 ? debt : "")); }} className="text-primary">
                          <Wallet className="h-4 w-4" />
                        </button>
                        <button onClick={() => window.confirm(t("delete_confirm")) && removeCustomer(c.id)} className="text-muted-foreground hover:text-destructive">
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

      <Modal open={open} onClose={() => setOpen(false)} title={t("new_customer")}>
        <Field label={t("name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label={t("phone")} inputMode="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label={t("credit_limit")} inputMode="decimal" value={form.creditLimit} onChange={(v) => setForm({ ...form, creditLimit: v })} />
        <Field label={t("note")} value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
        <Toggle label={t("wholesale_customer")} checked={form.wholesale} onChange={(v) => setForm({ ...form, wholesale: v })} />
        <Btn
          tone="success"
          className="w-full py-3"
          onClick={() => {
            if (!form.name.trim()) return;
            upsertCustomer({ name: form.name.trim(), phone: form.phone, note: form.note, wholesale: form.wholesale, creditLimit: Number(form.creditLimit) || 0 });
            setOpen(false);
          }}
        >
          {t("save")}
        </Btn>
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={t("pay_debt")}>
        <Field label={t("amount")} inputMode="decimal" value={amount} onChange={setAmount} />
        <Btn
          tone="success"
          className="w-full py-3"
          onClick={() => {
            const v = Number(amount.replace(",", ".")) || 0;
            if (payFor && v > 0) payDebt(payFor, v);
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
