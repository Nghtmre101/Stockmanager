/**
 * Excel report definitions — one place that maps the local database
 * onto neat, styled spreadsheets. Every label follows the language that
 * is currently selected in the app.
 */
import { customerDebt, saleDue, saleProfit, supplierDebt, type DB, type PayMethod } from "./db";
import { exportXlsx, type XSheet } from "./excel";
import type { ExcelReport } from "./store";
import type { Lang } from "./app-context";
import { reportT, REPORT_LOCALE, type RKey } from "./report-labels";

const d = (iso: string) => new Date(iso);
const stamp = () => new Date().toISOString().slice(0, 10);

/* eslint-disable @typescript-eslint/no-explicit-any */
function sheets(db: DB, lang: Lang): Record<Exclude<ExcelReport, "all">, XSheet<any>> {
  const t = reportT(lang);
  const rtl = lang === "ar";
  const store = db.settings.storeName || "Stock Manager";
  const period = `${store} — ${t("generated_on")} ${new Date().toLocaleString(REPORT_LOCALE[lang])}`;
  const dash = "—";

  const method = (m: PayMethod) => t(`m_${m}` as RKey);
  const status = (s: "done" | "held" | "returned") => t(`s_${s}` as RKey);


  const base = { subtitle: period, rtl };

  return {
    sales: {
      ...base,
      name: t("sheet_sales"),
      title: t("title_sales"),
      rows: db.sales,
      columns: [
        { header: t("no"), value: (s) => s.no, type: "number", format: "0", width: 8 },
        { header: t("date"), value: (s) => d(s.date), type: "date", format: "dd/mm/yyyy hh:mm", width: 18 },
        { header: t("customer"), value: (s) => db.customers.find((c) => c.id === s.customerId)?.name ?? dash },
        { header: t("items_count"), value: (s) => s.lines.length, type: "number", format: "0", width: 9 },
        { header: t("subtotal"), value: (s) => s.subtotal, type: "number", total: true },
        { header: t("discount"), value: (s) => s.discount, type: "number", total: true },
        { header: t("vat"), value: (s) => s.tva, type: "number", total: true },
        { header: t("stamp"), value: (s) => s.stamp, type: "number", total: true },
        { header: t("total"), value: (s) => s.total, type: "number", total: true },
        { header: t("paid"), value: (s) => s.paid, type: "number", total: true },
        { header: t("due"), value: (s) => saleDue(s), type: "number", total: true },
        { header: t("profit"), value: (s) => saleProfit(s), type: "number", total: true },
        { header: t("payment"), value: (s) => method(s.method), align: "center" },
        { header: t("status"), value: (s) => status(s.status), align: "center" },
      ],
    },
    products: {
      ...base,
      name: t("sheet_products"),
      title: t("title_products"),
      rows: db.products,
      columns: [
        { header: t("ref"), value: (p) => p.ref || dash, width: 12 },
        { header: t("item"), value: (p) => p.name, width: 32 },
        { header: t("barcode"), value: (p) => p.barcode || dash },
        { header: t("category"), value: (p) => p.category || dash },
        { header: t("unit"), value: (p) => p.unit || dash, align: "center" },
        { header: t("buy"), value: (p) => p.buy, type: "number" },
        { header: t("wholesale"), value: (p) => p.wholesale, type: "number" },
        { header: t("retail"), value: (p) => p.price, type: "number" },
        { header: t("stock"), value: (p) => p.stock, type: "number", format: "#,##0.##" },
        { header: t("min_stock"), value: (p) => p.minStock, type: "number", format: "#,##0.##" },
        { header: t("stock_value"), value: (p) => p.stock * p.buy, type: "number", total: true },
        { header: t("expiry"), value: (p) => (p.expiry ? new Date(p.expiry) : null), type: "date" },
      ],
    },
    purchases: {
      ...base,
      name: t("sheet_purchases"),
      title: t("title_purchases"),
      rows: db.purchases,
      columns: [
        { header: t("no"), value: (p) => p.no, type: "number", format: "0", width: 8 },
        { header: t("date"), value: (p) => d(p.date), type: "date" },
        { header: t("supplier"), value: (p) => db.suppliers.find((s) => s.id === p.supplierId)?.name ?? dash },
        { header: t("lines"), value: (p) => p.lines.length, type: "number", format: "0", width: 9 },
        { header: t("total"), value: (p) => p.total, type: "number", total: true },
        { header: t("paid"), value: (p) => p.paid, type: "number", total: true },
        { header: t("balance"), value: (p) => p.total - p.paid, type: "number", total: true },
        { header: t("note"), value: (p) => p.note ?? "" },
      ],
    },
    expenses: {
      ...base,
      name: t("sheet_expenses"),
      title: t("title_expenses"),
      rows: db.expenses,
      columns: [
        { header: t("date"), value: (e) => d(e.date), type: "date" },
        { header: t("category"), value: (e) => e.category || dash },
        { header: t("note"), value: (e) => e.note || dash, width: 34 },
        { header: t("amount"), value: (e) => e.amount, type: "number", total: true },
      ],
    },
    debts: {
      ...base,
      name: t("sheet_debts"),
      title: t("title_debts"),
      rows: db.customers,
      columns: [
        { header: t("customer"), value: (c) => c.name, width: 28 },
        { header: t("phone"), value: (c) => c.phone || dash },
        { header: t("credit_limit"), value: (c) => c.creditLimit, type: "number" },
        { header: t("debt"), value: (c) => customerDebt(db, c.id), type: "number", total: true },
        { header: t("note"), value: (c) => c.note || "" },
      ],
    },
    customers: {
      ...base,
      name: t("sheet_customers"),
      title: t("title_customers"),
      rows: db.customers,
      columns: [
        { header: t("name"), value: (c) => c.name, width: 28 },
        { header: t("phone"), value: (c) => c.phone || dash },
        { header: t("is_wholesale"), value: (c) => (c.wholesale ? t("yes") : t("no_")), align: "center" },
        { header: t("credit_limit"), value: (c) => c.creditLimit, type: "number" },
        {
          header: t("purchases_total"),
          value: (c) => db.sales.filter((s) => s.customerId === c.id).reduce((sum, s) => sum + s.total, 0),
          type: "number",
          total: true,
        },
        { header: t("debt"), value: (c) => customerDebt(db, c.id), type: "number", total: true },
      ],
    },
    suppliers: {
      ...base,
      name: t("sheet_suppliers"),
      title: t("title_suppliers"),
      rows: db.suppliers,
      columns: [
        { header: t("name"), value: (s) => s.name, width: 28 },
        { header: t("phone"), value: (s) => s.phone || dash },
        { header: t("supplier_balance"), value: (s) => supplierDebt(db, s.id), type: "number", total: true },
        { header: t("note"), value: (s) => s.note || "" },
      ],
    },
    staff: {
      ...base,
      name: t("sheet_staff"),
      title: t("title_staff"),
      rows: db.employees,
      columns: [
        { header: t("name"), value: (e) => e.name, width: 26 },
        { header: t("role"), value: (e) => e.role || dash },
        { header: t("phone"), value: (e) => e.phone || dash },
        { header: t("hired"), value: (e) => (e.hired ? new Date(e.hired) : null), type: "date" },
        { header: t("salary"), value: (e) => e.salary, type: "number", total: true },
        {
          header: t("paid_to_date"),
          value: (e) => db.payroll.filter((p) => p.employeeId === e.id).reduce((sum, p) => sum + p.amount, 0),
          type: "number",
          total: true,
        },
      ],
    },
  };
}

export async function buildReports(db: DB, kind: ExcelReport, lang: Lang = "fr") {
  const t = reportT(lang);
  const all = sheets(db, lang);
  const list = kind === "all" ? Object.values(all) : [all[kind]];
  const name = kind === "all" ? t("file_prefix") : all[kind].name;
  await exportXlsx(list, `${name}-${stamp()}.xlsx`);
}
