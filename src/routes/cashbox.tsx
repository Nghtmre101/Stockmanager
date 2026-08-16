import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Lock, Plus, Receipt, Trash2, Unlock, User } from "lucide-react";
import { useApp, useMoney, type TKey } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal, StatCard, Th } from "@/components/ui-kit";
import { printHTML, zReportHTML } from "@/lib/print";

export const Route = createFileRoute("/cashbox")({
  head: () => ({
    meta: [
      { title: "Cashbox — Stock Manager" },
      {
        name: "description",
        content: "Daily cashbox: sales, customer debts and expenses with per-user filtering.",
      },
      { property: "og:title", content: "Cashbox — Stock Manager" },
      { property: "og:description", content: "Daily sales, debts and expenses in one register." },
    ],
  }),
  component: Cashbox,
});

const tabs: TKey[] = ["sales_tab", "debts_tab", "expenses_tab"];
const num = (v: string) => Number(String(v).replace(",", ".")) || 0;
const isToday = (iso: string) => iso.slice(0, 10) === new Date().toISOString().slice(0, 10);

function Cashbox() {
  const { t, lang } = useApp();
  const money = useMoney();
  const { db, addExpense, removeExpense, openSession, closeSession, currentSession } = useStore();
  const [tab, setTab] = useState(0);
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [expDlg, setExpDlg] = useState(false);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [exp, setExp] = useState({ amount: "", note: "", category: "" });

  useEffect(() => {
    if (!currentSession) {
      openSession(0, db.settings.ownerName || "manager");
    }
  }, [currentSession, db.settings.ownerName, openSession]);

  const today = new Date().toISOString().slice(0, 10);

  const { sales, expenses, payments, totalSales, totalExpenses, totalDebts, cashSales } = useMemo(() => {
    const sales = db.sales.filter((s) => s.status === "done" && isToday(s.date));
    const expenses = db.expenses.filter((e) => isToday(e.date));
    const payments = db.debtPayments.filter((p) => isToday(p.date));
    return {
      sales,
      expenses,
      payments,
      totalSales: sales.reduce((s, i) => s + i.total, 0),
      totalExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      cashSales: sales.reduce((s, i) => s + Math.min(i.paid, i.total), 0),
      totalDebts: sales.reduce((s, i) => s + Math.max(0, i.total - i.paid), 0),
    };
  }, [db.sales, db.expenses, db.debtPayments]);

  const rowCount = tab === 0 ? sales.length : tab === 1 ? payments.length : expenses.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={<User className="h-4 w-4" />} text={db.settings.ownerName || t("manager")} />
        <Chip icon={<CalendarDays className="h-4 w-4" />} text={today} />
        <Chip
          icon={<Receipt className="h-4 w-4" />}
          text={
            currentSession
              ? `${t("session_since")} ${currentSession.openedAt.slice(11, 16)}`
              : t("no_session")
          }
        />
        <div className="ms-auto flex flex-wrap gap-2">
          <Btn tone="accent" onClick={() => setExpDlg(true)}>
            <Plus className="h-4 w-4" /> {t("add_expense")}
          </Btn>
          {currentSession ? (
            <Btn tone="danger" onClick={() => setCloseDlg(true)}>
              <Lock className="h-4 w-4" /> {t("close_box")}
            </Btn>
          ) : (
            <Btn tone="success" onClick={() => setOpenDlg(true)}>
              <Unlock className="h-4 w-4" /> {t("open_box")}
            </Btn>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("total_sales")} value={money(totalSales)} tone="primary" />
        <StatCard label={t("debts")} value={money(totalDebts)} tone="warning" />
        <StatCard label={t("expenses")} value={money(totalExpenses)} tone="danger" />
        <StatCard label={t("net")} value={money(totalSales - totalExpenses)} tone="success" />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((k, i) => (
          <button
            key={k}
            onClick={() => setTab(i)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-black transition",
              i === tab
                ? "brand-gradient text-primary-foreground glow-shadow"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {t(k)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto surface-card">
        {rowCount === 0 ? (
          <EmptyState
            title={tab === 2 ? t("empty_expenses") : t("empty_table")}
            hint={tab === 2 ? t("empty_expenses_hint") : t("empty_table_hint")}
          />
        ) : tab === 2 ? (
          <table className="w-full min-w-[560px] text-sm">
            <Th cols={[t("date"), t("expense_category"), t("amount"), t("note"), ""]} />
            <tbody>
              {expenses.map((e, i) => (
                <tr key={e.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                  <td className="px-3 py-2.5 font-mono text-xs">{e.date.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 font-bold">{e.category || "—"}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-destructive">
                    {money(e.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{e.note}</td>
                  <td className="px-3 py-2.5">
                    <button
                      aria-label={t("delete")}
                      onClick={() => window.confirm(t("delete_confirm")) && removeExpense(e.id)}
                      className="rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === 1 ? (
          <table className="w-full min-w-[520px] text-sm">
            <Th cols={[t("date"), t("customer_name"), t("amount"), t("note")]} />
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                  <td className="px-3 py-2.5 font-mono text-xs">{p.date.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 font-bold">
                    {db.customers.find((c) => c.id === p.customerId)?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono font-black text-success">
                    {money(p.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <Th cols={[t("invoice_no"), t("user"), t("amount"), t("items_count"), t("date")]} />
            <tbody>
              {sales.map((inv, i) => (
                <tr key={inv.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                  <td className="px-3 py-2.5 font-mono font-bold">{inv.no}</td>
                  <td className="px-3 py-2.5 font-bold">{inv.user || t("manager")}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-success">
                    {money(inv.total)}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{inv.lines.length}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{inv.date.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={openDlg} onClose={() => setOpenDlg(false)} title={t("open_box")}>
        <Field
          label={t("opening_float")}
          value={opening}
          inputMode="decimal"
          onChange={setOpening}
        />
        <Btn
          tone="success"
          className="w-full py-3 text-sm"
          onClick={() => {
            openSession(num(opening), db.settings.ownerName || "manager");
            setOpening("");
            setOpenDlg(false);
          }}
        >
          {t("confirm")}
        </Btn>
      </Modal>

      <Modal open={closeDlg} onClose={() => setCloseDlg(false)} title={t("close_box")}>
        <Field label={t("counted_cash")} value={counted} inputMode="decimal" onChange={setCounted} />
        <p className="text-xs font-bold text-muted-foreground">
          {t("expected_cash")}: {money((currentSession?.opening ?? 0) + totalSales - totalExpenses)}
        </p>
        <Btn
          tone="danger"
          className="w-full py-3 text-sm"
          onClick={() => {
            const opened = currentSession;
            const s = closeSession(num(counted));
            setCounted("");
            setCloseDlg(false);
            if (!s) return;
            printHTML(
              zReportHTML(db, lang, {
                from: (opened?.openedAt ?? s.openedAt).slice(0, 16).replace("T", " "),
                to: new Date().toISOString().slice(0, 16).replace("T", " "),
                sales: totalSales,
                cash: cashSales,
                credit: totalDebts,
                expenses: totalExpenses,
                profit: totalSales - totalExpenses,
                count: sales.length,
                opening: s.opening,
                counted: s.counted,
              }),
            );
          }}
        >
          {t("confirm")}
        </Btn>
      </Modal>

      <Modal open={expDlg} onClose={() => setExpDlg(false)} title={t("add_expense")}>
        <Field
          label={t("amount")}
          value={exp.amount}
          inputMode="decimal"
          onChange={(v) => setExp((e) => ({ ...e, amount: v }))}
        />
        <Field
          label={t("expense_category")}
          value={exp.category}
          onChange={(v) => setExp((e) => ({ ...e, category: v }))}
        />
        <Field
          label={t("note")}
          value={exp.note}
          onChange={(v) => setExp((e) => ({ ...e, note: v }))}
        />
        <Btn
          tone="success"
          className="w-full py-3 text-sm"
          disabled={num(exp.amount) <= 0}
          onClick={() => {
            addExpense({ amount: num(exp.amount), note: exp.note, category: exp.category });
            setExp({ amount: "", note: "", category: "" });
            setExpDlg(false);
          }}
        >
          {t("save")}
        </Btn>
      </Modal>
    </div>
  );
}

function Chip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-2 surface-card px-3 py-2 text-xs font-bold">
      <span className="text-muted-foreground">{icon}</span>
      {text}
    </span>
  );
}
