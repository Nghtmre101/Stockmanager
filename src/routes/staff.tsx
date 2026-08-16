import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BadgeDollarSign, Briefcase, Pencil, Plus, Trash2, UserPlus, Wallet } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal, StatCard, Th } from "@/components/ui-kit";
import type { Payroll } from "@/lib/db";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff Management — Stock Manager" },
      {
        name: "description",
        content: "Track employees, salaries, advances and store purchases per worker.",
      },
      { property: "og:title", content: "Staff Management — Stock Manager" },
      { property: "og:description", content: "Employees, salaries, advances and purchases." },
    ],
  }),
  component: Staff,
});

const num = (v: string) => Number(String(v).replace(",", ".")) || 0;
const emptyEmp = { id: "", name: "", role: "", phone: "", salary: "", hired: "" };

function Staff() {
  const { t } = useApp();
  const money = useMoney();
  const { db, upsertEmployee, removeEmployee, addPayroll, addExpense } = useStore();

  const [selId, setSelId] = useState<string>("");
  const [empDlg, setEmpDlg] = useState(false);
  const [payDlg, setPayDlg] = useState<Payroll["kind"] | null>(null);
  const [expDlg, setExpDlg] = useState(false);
  const [form, setForm] = useState(emptyEmp);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const emp = db.employees.find((e) => e.id === selId) ?? db.employees[0];

  const { rows, salaryPaid, bonusTotal, advanceTotal, totalPaid, empExpenses } = useMemo(() => {
    const rows = emp ? db.payroll.filter((p) => p.employeeId === emp.id) : [];
    const empExpenses = emp ? db.expenses.filter((e) => e.employeeId === emp.id) : [];
    const salaryPaid = rows.filter((p) => p.kind === "salary").reduce((s, p) => s + p.amount, 0);
    const bonusTotal = rows.filter((p) => p.kind === "bonus").reduce((s, p) => s + p.amount, 0);
    const advanceTotal = rows.filter((p) => p.kind === "advance").reduce((s, p) => s + p.amount, 0);
    return {
      rows: [...rows].reverse(),
      salaryPaid,
      bonusTotal,
      advanceTotal,
      totalPaid: salaryPaid + bonusTotal + advanceTotal,
      empExpenses,
    };
  }, [db.payroll, db.expenses, emp]);

  const expensesTotal = empExpenses.reduce((s, e) => s + e.amount, 0);

  const kindLabel = (k: Payroll["kind"]) =>
    k === "salary" ? t("salary") : k === "advance" ? t("advance") : t("bonus");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl brand-gradient p-4 glow-shadow sm:flex sm:justify-between">
        <h1 className="flex min-w-0 items-center gap-2 truncate text-lg font-black text-primary-foreground">
          <Briefcase className="h-5 w-5 shrink-0" /> {t("staff_mgmt")}
        </h1>
        <button
          onClick={() => {
            setForm(emptyEmp);
            setEmpDlg(true);
          }}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground/15 px-3 py-2 text-xs font-black text-primary-foreground transition active:scale-95"
        >
          <UserPlus className="h-4 w-4" /> {t("new_employee")}
        </button>
      </div>

      {db.employees.length === 0 ? (
        <div className="surface-card">
          <EmptyState title={t("empty_staff")} hint={t("empty_staff_hint")} />
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {db.employees.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelId(s.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-xs font-black transition",
                  s.id === emp?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {s.name}
                {s.role ? ` · ${s.role}` : ""}
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <StatCard
              label={t("net_salary")}
              value={money(Math.max(0, (emp?.salary ?? 0) - salaryPaid + bonusTotal - advanceTotal - expensesTotal))}
              tone="success"
            />
            <StatCard label={t("total_paid")} value={money(totalPaid)} />
            <div className="surface-card space-y-2 p-4 text-xs font-bold">
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("advance")}</span>
                <span className="text-destructive">{money(advanceTotal)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("daily_expenses")}</span>
                <span className="text-destructive">{money(expensesTotal)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("salary")}</span>
                <span className="text-primary">{money(emp?.salary ?? 0)}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn tone="primary" onClick={() => setPayDlg("salary")}>
              <Wallet className="h-4 w-4" /> {t("pay_salary")}
            </Btn>
            <Btn tone="accent" onClick={() => setPayDlg("advance")}>
              <Plus className="h-4 w-4" /> {t("advance")}
            </Btn>
            <Btn tone="warning" onClick={() => setPayDlg("bonus")}>
              <BadgeDollarSign className="h-4 w-4" /> {t("bonus")}
            </Btn>
            <Btn tone="muted" onClick={() => setExpDlg(true)}>
              <Plus className="h-4 w-4" /> {t("add_expense")}
            </Btn>
            <Btn
              tone="accent"
              disabled={!emp}
              onClick={() => {
                if (!emp) return;
                setForm({
                  id: emp.id,
                  name: emp.name,
                  role: emp.role,
                  phone: emp.phone,
                  salary: String(emp.salary),
                  hired: emp.hired,
                });
                setEmpDlg(true);
              }}
            >
              <Pencil className="h-4 w-4" /> {t("edit")}
            </Btn>
            <Btn
              tone="danger"
              onClick={() =>
                emp && window.confirm(t("delete_confirm")) && (removeEmployee(emp.id), setSelId(""))
              }
            >
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </Btn>
          </div>

          <div className="overflow-x-auto surface-card">
            {rows.length === 0 ? (
              <EmptyState title={t("empty_table")} hint={t("empty_table_hint")} />
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <Th cols={[t("date"), t("kind"), t("amount"), t("note")]} />
                <tbody>
                  {rows.map((p, i) => (
                    <tr key={p.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                      <td className="px-3 py-2.5 font-mono text-xs">{p.date.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 text-xs font-black">{kindLabel(p.kind)}</td>
                      <td
                  className={cn(
                    "px-3 py-2.5 font-mono font-black",
                    p.kind === "advance"
                      ? "text-destructive"
                      : p.kind === "bonus"
                      ? "text-success"
                      : "text-primary",
                  )}
                >
                  {money(p.kind === "advance" ? -p.amount : p.amount)}
                </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <Modal open={empDlg} onClose={() => setEmpDlg(false)} title={form.id ? t("edit") : t("new_employee")}>
        <Field
          label={t("name")}
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
        />
        <Field
          label={t("role")}
          value={form.role}
          onChange={(v) => setForm((f) => ({ ...f, role: v }))}
        />
        <Field
          label={t("phone")}
          value={form.phone}
          inputMode="tel"
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
        />
        <Field
          label={t("hired")}
          type="date"
          value={form.hired}
          onChange={(v) => setForm((f) => ({ ...f, hired: v }))}
        />
        <Field
          label={t("salary")}
          value={form.salary}
          inputMode="decimal"
          onChange={(v) => setForm((f) => ({ ...f, salary: v }))}
        />
        <Btn
          tone="success"
          className="w-full py-3 text-sm"
          disabled={!form.name.trim()}
          onClick={() => {
            const created = upsertEmployee({
              id: form.id || undefined,
              name: form.name.trim(),
              role: form.role.trim(),
              phone: form.phone.trim(),
              salary: num(form.salary),
              hired: form.hired || undefined,
            });
            setSelId(created.id);
            setForm(emptyEmp);
            setEmpDlg(false);
          }}
        >
          {t("save")}
        </Btn>
      </Modal>

      <Modal
        open={payDlg !== null}
        onClose={() => setPayDlg(null)}
        title={payDlg ? kindLabel(payDlg) : ""}
      >
        <p className="text-xs font-bold text-muted-foreground">
          {t("employee")}: {emp?.name ?? "—"}
        </p>
        <Field label={t("amount")} value={amount} inputMode="decimal" onChange={setAmount} />
        <Field label={t("note")} value={note} onChange={setNote} />
        <Btn
          tone="success"
          className="w-full py-3 text-sm"
          disabled={!emp || num(amount) <= 0}
          onClick={() => {
            if (!emp || !payDlg) return;
            addPayroll({ employeeId: emp.id, amount: num(amount), kind: payDlg, note });
            setAmount("");
            setNote("");
            setPayDlg(null);
          }}
        >
          {t("confirm")}
        </Btn>
      </Modal>

      <Modal open={expDlg} onClose={() => setExpDlg(false)} title={t("add_expense")}>
        <Field label={t("amount")} value={amount} inputMode="decimal" onChange={setAmount} />
        <Field label={t("note")} value={note} onChange={setNote} />
        <Btn
          tone="success"
          className="w-full py-3 text-sm"
          disabled={num(amount) <= 0}
          onClick={() => {
            addExpense({
              amount: num(amount),
              note,
              category: t("staff"),
              employeeId: emp?.id,
            });
            setAmount("");
            setNote("");
            setExpDlg(false);
          }}
        >
          {t("save")}
        </Btn>
      </Modal>
    </div>
  );
}
