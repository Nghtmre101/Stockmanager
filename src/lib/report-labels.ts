/**
 * Labels used by the Excel reports. Exports follow the language that is
 * currently selected in the app (ar / fr / en) — sheet names, titles,
 * column headers, and cell values such as payment method or status.
 */
import type { Lang } from "./app-context";

type Entry = { ar: string; fr: string; en: string };

const L = {
  /* sheets */
  sheet_sales: { ar: "المبيعات", fr: "Ventes", en: "Sales" },
  sheet_products: { ar: "المواد", fr: "Articles", en: "Items" },
  sheet_purchases: { ar: "المشتريات", fr: "Achats", en: "Purchases" },
  sheet_expenses: { ar: "المصاريف", fr: "Dépenses", en: "Expenses" },
  sheet_debts: { ar: "ديون الزبائن", fr: "Créances", en: "Debts" },
  sheet_customers: { ar: "الزبائن", fr: "Clients", en: "Customers" },
  sheet_suppliers: { ar: "الممونين", fr: "Fournisseurs", en: "Suppliers" },
  sheet_staff: { ar: "العمال", fr: "Personnel", en: "Staff" },

  /* titles */
  title_sales: { ar: "سجل المبيعات", fr: "Journal des ventes", en: "Sales journal" },
  title_products: { ar: "المواد والمخزون", fr: "Articles et stock", en: "Items & stock" },
  title_purchases: { ar: "سجل المشتريات", fr: "Journal des achats", en: "Purchases journal" },
  title_expenses: { ar: "المصاريف", fr: "Dépenses", en: "Expenses" },
  title_debts: { ar: "ديون الزبائن", fr: "Créances clients", en: "Customer debts" },
  title_customers: { ar: "الزبائن", fr: "Clients", en: "Customers" },
  title_suppliers: { ar: "الممونين", fr: "Fournisseurs", en: "Suppliers" },
  title_staff: { ar: "العمال والأجور", fr: "Personnel et salaires", en: "Staff & payroll" },

  /* columns */
  no: { ar: "الرقم", fr: "N°", en: "No." },
  date: { ar: "التاريخ", fr: "Date", en: "Date" },
  customer: { ar: "الزبون", fr: "Client", en: "Customer" },
  supplier: { ar: "الممون", fr: "Fournisseur", en: "Supplier" },
  items_count: { ar: "عدد المواد", fr: "Articles", en: "Items" },
  lines: { ar: "عدد الأسطر", fr: "Lignes", en: "Lines" },
  subtotal: { ar: "المجموع", fr: "Sous-total", en: "Subtotal" },
  discount: { ar: "التخفيض", fr: "Remise", en: "Discount" },
  vat: { ar: "الرسم على القيمة المضافة", fr: "TVA", en: "VAT" },
  stamp: { ar: "الطابع الجبائي", fr: "Timbre", en: "Stamp" },
  total: { ar: "الإجمالي", fr: "Total", en: "Total" },
  paid: { ar: "المدفوع", fr: "Payé", en: "Paid" },
  due: { ar: "الباقي", fr: "Reste", en: "Due" },
  profit: { ar: "الربح", fr: "Bénéfice", en: "Profit" },
  payment: { ar: "طريقة الدفع", fr: "Paiement", en: "Payment" },
  status: { ar: "الحالة", fr: "État", en: "Status" },
  ref: { ar: "المرجع", fr: "Réf.", en: "Ref" },
  item: { ar: "المادة", fr: "Article", en: "Item" },
  barcode: { ar: "الباركود", fr: "Code-barres", en: "Barcode" },
  category: { ar: "الصنف", fr: "Catégorie", en: "Category" },
  unit: { ar: "الوحدة", fr: "Unité", en: "Unit" },
  buy: { ar: "سعر الشراء", fr: "Prix d'achat", en: "Buy" },
  wholesale: { ar: "سعر الجملة", fr: "Prix de gros", en: "Wholesale" },
  retail: { ar: "سعر البيع", fr: "Prix de vente", en: "Retail" },
  stock: { ar: "المخزون", fr: "Stock", en: "Stock" },
  min_stock: { ar: "الحد الأدنى", fr: "Min.", en: "Min" },
  stock_value: { ar: "قيمة المخزون", fr: "Valeur du stock", en: "Stock value" },
  expiry: { ar: "تاريخ الصلاحية", fr: "Péremption", en: "Expiry" },
  balance: { ar: "الرصيد", fr: "Solde", en: "Balance" },
  note: { ar: "ملاحظة", fr: "Note", en: "Note" },
  amount: { ar: "المبلغ", fr: "Montant", en: "Amount" },
  name: { ar: "الاسم", fr: "Nom", en: "Name" },
  phone: { ar: "الهاتف", fr: "Téléphone", en: "Phone" },
  credit_limit: { ar: "سقف الكريدي", fr: "Plafond crédit", en: "Credit limit" },
  debt: { ar: "الدين", fr: "Créance", en: "Debt" },
  purchases_total: { ar: "مجموع المشتريات", fr: "Total achats", en: "Purchases" },
  is_wholesale: { ar: "بالجملة", fr: "Gros", en: "Wholesale" },
  role: { ar: "الوظيفة", fr: "Poste", en: "Role" },
  hired: { ar: "تاريخ التوظيف", fr: "Embauche", en: "Hired" },
  salary: { ar: "الراتب", fr: "Salaire", en: "Salary" },
  paid_to_date: { ar: "المدفوع إلى اليوم", fr: "Payé à ce jour", en: "Paid to date" },
  supplier_balance: { ar: "المستحق للممون", fr: "Solde fournisseur", en: "Balance due" },

  /* values */
  yes: { ar: "نعم", fr: "Oui", en: "Yes" },
  no_: { ar: "لا", fr: "Non", en: "No" },
  none: { ar: "—", fr: "—", en: "—" },
  m_cash: { ar: "نقدًا", fr: "Espèces", en: "Cash" },
  m_credit: { ar: "كريدي", fr: "Crédit", en: "Credit" },
  m_card: { ar: "بطاقة", fr: "Carte", en: "Card" },
  m_ccp: { ar: "بريد الجزائر", fr: "CCP", en: "CCP" },
  m_baridimob: { ar: "بريدي موب", fr: "BaridiMob", en: "BaridiMob" },
  s_done: { ar: "منتهية", fr: "Validée", en: "Done" },
  s_held: { ar: "معلّقة", fr: "En attente", en: "Held" },
  s_returned: { ar: "مرتجعة", fr: "Retournée", en: "Returned" },

  /* misc */
  generated_on: { ar: "حُرّر في", fr: "Généré le", en: "Generated on" },
  file_prefix: { ar: "تقرير", fr: "rapport", en: "report" },
} as const satisfies Record<string, Entry>;

export type RKey = keyof typeof L;

export function reportT(lang: Lang) {
  return (k: RKey) => L[k][lang];
}

export const REPORT_LOCALE: Record<Lang, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
  en: "en-US",
};
