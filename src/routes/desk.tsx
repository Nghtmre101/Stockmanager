import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Clock,
  FileSpreadsheet,
  Package,
  Printer,
  Receipt,
  Users,
} from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { dayKey, round2, saleNetTotal, type Sale, type SaleLine } from "@/lib/db";
import { printHTML } from "@/lib/print";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Modal, Th } from "@/components/ui-kit";

const fmtTime = (iso?: string) => (typeof iso === "string" ? iso.slice(11, 16) : "—");
const fmtDateInput = (d: Date) => d.toISOString().slice(0, 10);
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? String.fromCharCode(38) + "amp;"
    : c === "<" ? String.fromCharCode(38) + "lt;"
    : c === ">" ? String.fromCharCode(38) + "gt;"
    : String.fromCharCode(38) + "quot;",
  );

export const Route = createFileRoute("/desk")({
  head: () => ({
    meta: [
      { title: "Attendance — Stock Manager" },
      {
        name: "description",
        content: "See who was on the desk each day with their first and last sale timestamps.",
      },
    ],
  }),
  component: Desk,
});

type Row = { user: string; first: string; last: string; count: number; total: number };

function Desk() {
  const { t } = useApp();
  const money = useMoney();
  const { db } = useStore();
  const [date, setDate] = useState(fmtDateInput(new Date()));
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const daySales = useMemo(
    () =>
      db.sales
        .filter(
          (s) => (s.status === "done" || s.status === "returned") && dayKey(s.date) === date,
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [db.sales, date],
  );

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    daySales.forEach((s: Sale) => {
      const existing = map.get(s.user);
      if (!existing) {
        map.set(s.user, { user: s.user, first: s.date, last: s.date, count: 0, total: 0 });
      }
      const r = map.get(s.user)!;
      if (s.date < r.first) r.first = s.date;
      if (s.date > r.last) r.last = s.date;
      r.count += 1;
      r.total += saleNetTotal(s);
    });
    return [...map.values()].sort((a, b) => a.first.localeCompare(b.first));
  }, [daySales]);

  const totals = useMemo(
    () => ({
      count: daySales.length,
      revenue: daySales.reduce((sum, s) => sum + saleNetTotal(s), 0),
    }),
    [daySales],
  );

  /* Refunds recorded on the selected day (for the summary + per-employee view). */
  const dayRefunds = useMemo(() => db.refunds.filter((r) => dayKey(r.date) === date), [db.refunds, date]);
  const dayRefundTotal = useMemo(() => round2(dayRefunds.reduce((sum, r) => sum + r.total, 0)), [dayRefunds]);

  /* ---- detail view for a clicked employee ---- */
  const userDaySales = useMemo(() => daySales.filter((s) => s.user === selectedUser), [daySales, selectedUser]);
  const userRevenue = useMemo(() => userDaySales.reduce((sum, s) => sum + saleNetTotal(s), 0), [userDaySales]);
  const userItemsTotal = useMemo(
    () =>
      userDaySales.reduce(
        (sum, s) => sum + s.lines.reduce((q, l) => q + (l.qty - (l.refundedQty ?? 0)), 0),
        0,
      ),
    [userDaySales],
  );
  const userRefunds = useMemo(
    () => db.refunds.filter((r) => r.user === selectedUser && dayKey(r.date) === date),
    [db.refunds, selectedUser, date],
  );
  const userRefundTotal = useMemo(() => round2(userRefunds.reduce((sum, r) => sum + r.total, 0)), [userRefunds]);

  /* ---- print / export the daily attendance sheet ---- */
  const printReport = () => {
    const storeName = db.settings.storeName || t("appName");
    const rowsHtml = rows
      .map((r) => {
        const sales = daySales.filter((s) => s.user === r.user);
        const items = sales.reduce(
          (q, s) => q + s.lines.reduce((a, l) => a + (l.qty - (l.refundedQty ?? 0)), 0),
          0,
        );
        return `<tr><td>${esc(r.user)}</td><td>${esc(r.first.slice(11, 16))}</td><td>${esc(
          r.last.slice(11, 16),
        )}</td><td>${r.count}</td><td>${items}</td><td>${esc(money(r.total))}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t("nav_desk"))}</title>
<style>
 body{font-family:'Segoe UI',Tahoma,sans-serif;padding:16px}
 h2{margin:0 0 4px}
 .meta{color:#555;margin-bottom:12px}
 table{width:100%;border-collapse:collapse}
 th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
 th{background:#f0f0f0}
 .num{text-align:right}
</style></head><body>
 <h2>${esc(storeName)}</h2>
 <div class="meta">${esc(date)}</div>
 <table><thead><tr><th>${esc(t("desk_onshift"))}</th><th>${esc(t("desk_first"))}</th><th>${esc(
   t("desk_last"),
 )}</th><th>${esc(t("desk_sales"))}</th><th>${esc(t("desk_items_total"))}</th><th>${esc(
   t("invoice_total"),
 )}</th></tr></thead>
 <tbody>${rowsHtml}</tbody></table>
</body></html>`;
    printHTML(html);
  };

  const exportCSV = () => {
    const head = [
      t("desk_onshift"),
      t("desk_first"),
      t("desk_last"),
      t("desk_sales"),
      t("desk_items_total"),
      t("invoice_total"),
    ];
    const lines = rows.map((r) => {
      const sales = daySales.filter((s) => s.user === r.user);
      const items = sales.reduce(
        (q, s) => q + s.lines.reduce((a, l) => a + (l.qty - (l.refundedQty ?? 0)), 0),
        0,
      );
      return [r.user, r.first.slice(11, 16), r.last.slice(11, 16), r.count, items, r.total];
    });
    const csv =
      "" +
      [head, ...lines]
        .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xl font-bold">{t("desk_title")}</p>
            <p className="text-sm text-muted-foreground">{t("desk_onshift")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={printReport}
            className="surface-card flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold"
          >
            <Printer className="h-4 w-4" /> {t("print")}
          </button>
          <button
            onClick={exportCSV}
            className="surface-card flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4" /> {t("export_csv")}
          </button>
          <div className="surface-card flex items-center gap-3 rounded-2xl px-3 py-2 text-sm">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent font-semibold outline-none"
              aria-label={t("desk_pick")}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card rounded-3xl p-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{t("desk_onshift")}</span>
          </div>
          <p className="mt-3 text-sm font-bold">
            {rows.length} {t("desk_onshift")}
          </p>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <Receipt className="h-4 w-4" />
            <span>{t("desk_sales")}</span>
          </div>
          <p className="mt-3 text-sm font-bold">
            {totals.count} {t("desk_sales")}
          </p>
          <p className="mt-1 text-2xl font-black text-foreground">{money(totals.revenue)}</p>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <ArrowLeftRight className="h-4 w-4" />
            <span>{t("refund")}</span>
          </div>
          <p className="mt-3 text-sm font-bold">
            {dayRefunds.length} {t("refund")}
          </p>
          <p className="mt-1 text-2xl font-black text-foreground">{money(dayRefundTotal)}</p>
        </div>
      </div>

      <div className="overflow-x-auto surface-card rounded-3xl">
        {rows.length === 0 ? (
          <EmptyState title={t("empty_table")} hint={t("desk_no_activity")} />
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <Th
              cols={[
                t("desk_onshift"),
                t("desk_first"),
                t("desk_last"),
                t("desk_sales"),
                t("invoice_total"),
              ]}
            />
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.user}
                  onClick={() => setSelectedUser(r.user)}
                  className={cn(
                    i % 2 ? "bg-secondary/40" : undefined,
                    "cursor-pointer transition-colors hover:bg-primary/10",
                  )}
                >
                  <td className="px-3 py-2.5 font-bold">{r.user}</td>
                  <td className="px-3 py-2.5 font-mono">{fmtTime(r.first)}</td>
                  <td className="px-3 py-2.5 font-mono">{fmtTime(r.last)}</td>
                  <td className="px-3 py-2.5 font-mono">{r.count}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-success">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Employee detail — every item they sold that day */}
      {selectedUser && (
        <Modal
          open
          onClose={() => setSelectedUser(null)}
          title={`${t("desk_employee_sales")} — ${selectedUser}`}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="surface-card rounded-2xl p-3">
                <p className="text-xs font-bold text-muted-foreground">{t("desk_sales")}</p>
                <p className="text-xl font-black">{userDaySales.length}</p>
              </div>
              <div className="surface-card rounded-2xl p-3">
                <p className="text-xs font-bold text-muted-foreground">{t("desk_items_total")}</p>
                <p className="text-xl font-black">{userItemsTotal}</p>
              </div>
              <div className="surface-card rounded-2xl p-3">
                <p className="text-xs font-bold text-muted-foreground">{t("invoice_total")}</p>
                <p className="text-xl font-black text-success">{money(userRevenue)}</p>
              </div>
              <div className="surface-card rounded-2xl p-3">
                <p className="text-xs font-bold text-muted-foreground">{t("refund")}</p>
                <p className="text-xl font-black text-destructive">{userRefunds.length}</p>
                <p className="text-[11px] font-bold text-muted-foreground">{money(userRefundTotal)}</p>
              </div>
            </div>

            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {userDaySales.map((sale) => (
                <div key={sale.id} className="rounded-2xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-black">{fmtTime(sale.date)}</span>
                    <span className="font-mono text-muted-foreground">#{sale.no}</span>
                    <span className="font-mono font-black text-success">{money(saleNetTotal(sale))}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {sale.lines.map((line: SaleLine, idx) => {
                      const qty = line.qty - (line.refundedQty ?? 0);
                      return (
                        <div
                          key={`${line.productId}-${idx}`}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate font-bold">{line.name}</span>
                            {line.refundedQty ? (
                              <span className="text-[10px] font-black text-destructive">-{line.refundedQty}</span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 font-mono">
                            <span className="text-muted-foreground">×{qty}</span>
                            <span className="font-black">{money(roundLine(line))}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Net amount of a single line (qty already excluding refunded units). */
function roundLine(line: SaleLine): number {
  const qty = line.qty - (line.refundedQty ?? 0);
  return Math.round((qty * line.price - line.discount) * 100) / 100;
}