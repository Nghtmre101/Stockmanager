/**
 * Stock Manager — local-first data layer ("the backend").
 *
 * Everything is stored on the device (localStorage) so the app keeps
 * selling when the internet is down — the normal case for a shop in Algeria.
 * The whole database can be exported / imported as a single JSON file.
 */

export type ID = string;

export type PayMethod = "cash" | "credit" | "card" | "ccp" | "baridimob";

export type Settings = {
  storeName: string;
  ownerName: string;
  address: string;
  wilaya: string;
  phone: string;
  email: string;
  rc: string; // Registre de commerce
  nif: string; // Numéro d'identification fiscale
  nis: string; // Numéro d'identification statistique
  ai: string; // Article d'imposition
  rib: string;
  tvaRate: number; // 19 / 9 / 0
  tvaEnabled: boolean;
  stampDuty: boolean; // droit de timbre 1% on cash invoices
  currency: string;
  lowStock: number;
  receiptFooter: string;
  printWidth: "58" | "80" | "a4";
  /** Optional store logo (data URL) printed on receipts and invoices. */
  logo?: string;
  /** Print the logo on thermal receipts too (A4 always shows it). */
  logoOnReceipt: boolean;
  /* ---- loyalty programme ---- */
  /** Give customers points on every paid sale. */
  loyaltyEnabled: boolean;
  /** How much a customer must spend to earn 1 point. */
  loyaltyEarnPer: number;
  /** What 1 point is worth when redeemed, in store currency. */
  loyaltyPointValue: number;
};

export type Category = {
  id: ID;
  name: string;
  color: string;
  note: string;
};

export type Product = {
  id: ID;
  ref: string; // internal reference (auto or manual)
  name: string;
  image?: string; // data URL, optional product photo
  barcode: string;
  category: string;
  unit: string; // pièce, kg, L, carton...
  buy: number;
  wholesale: number;
  price: number; // retail
  stock: number;
  minStock: number;
  expiry?: string;
  supplierId?: ID;
  archived?: boolean;
};

export type Customer = {
  id: ID;
  name: string;
  phone: string;
  note: string;
  wholesale: boolean;
  creditLimit: number;
  /** Loyalty points currently available. */
  points?: number;
};

export type Supplier = { id: ID; name: string; phone: string; note: string };

export type SaleLine = {
  productId: ID;
  name: string;
  qty: number;
  price: number;
  cost: number;
  discount: number;
  /** Quantity already refunded (product-level refunds). */
  refundedQty?: number;
};

export type Sale = {
  id: ID;
  no: number;
  date: string; // ISO
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  tva: number;
  stamp: number;
  total: number;
  paid: number;
  method: PayMethod;
  customerId?: ID;
  user: string;
  /** "done" sales may be partially refunded (see SaleLine.refundedQty). */
  status: "done" | "held" | "returned";
  note?: string;
  /** Loyalty points granted by this sale. */
  pointsEarned?: number;
  /** Loyalty points redeemed on this sale. */
  pointsSpent?: number;
};

export type PurchaseLine = {
  name: string;
  barcode: string;
  qty: number;
  buy: number;
  wholesale: number;
  sell: number;
  productId?: ID;
};

export type Purchase = {
  id: ID;
  no: number;
  date: string;
  supplierId?: ID;
  lines: PurchaseLine[];
  total: number;
  paid: number;
  note?: string;
};

export type Expense = {
  id: ID;
  date: string;
  amount: number;
  note: string;
  category: string;
  employeeId?: ID;
};

export type Damage = {
  id: ID;
  date: string;
  productId?: ID;
  item: string;
  qty: number;
  loss: number;
  reason: string;
};

export type Employee = {
  id: ID;
  name: string;
  role: string;
  phone: string;
  salary: number;
  hired: string;
};

export type Payroll = {
  id: ID;
  date: string;
  employeeId: ID;
  amount: number;
  kind: "salary" | "advance" | "bonus";
  note: string;
};

export type DebtPayment = {
  id: ID;
  date: string;
  customerId: ID;
  amount: number;
  note: string;
};

export type SupplierPayment = {
  id: ID;
  date: string;
  supplierId: ID;
  amount: number;
  note: string;
};

export type CashSession = {
  id: ID;
  openedAt: string;
  closedAt?: string;
  opening: number;
  counted?: number;
  user: string;
};

/** A product-level refund — records which items were returned and how much was given back. */
export type Refund = {
  id: ID;
  saleId: ID;
  date: string; // ISO
  user: string;
  lines: {
    productId: ID;
    name: string;
    qty: number;
    price: number;
    /** Money actually refunded for this line (all-inclusive of discount / TVA / stamp). */
    refunded: number;
  }[];
  /** Total money refunded on this operation. */
  total: number;
  note?: string;
};

/**
 * Stock movement — the conflict-safe inventory ledger.
 *
 * Every stock change (sale, return, purchase, damage, stock adjustment,
 * stock-in) is recorded as an immutable movement with a unique ID. The
 * product's displayed stock is derived locally as:
 *
 *   stock = qty of the most recent "stocktake" movement
 *           + Σ qty of all later delta movements
 *
 * Because movements are keyed by unique IDs, applying them to Firebase is
 * idempotent — re-sending after a reconnect can never double-apply, and two
 * devices adjusting the same product simply append movements that sum.
 */
export type StockMovementType =
  | "stocktake" // absolute stock set by admin (qty = new total)
  | "stockin"   // goods added by admin (+qty)
  | "sale"      // sale deduction (-qty)
  | "return"    // refund restock (+qty)
  | "purchase"  // purchase / supplier delivery (+qty)
  | "damage";   // damaged / expired / loss (-qty)

export type StockMovement = {
  id: ID;
  productId: ID;
  type: StockMovementType;
  /** Signed quantity: positive adds stock, negative removes stock. */
  qty: number;
  /** For stocktake, qty is the new absolute total. */
  absolute?: boolean;
  /** Related sale / purchase / refund id when relevant. */
  refId?: ID;
  uid?: string;
  ts: string; // ISO
  note?: string;
};

export type DB = {
  version: number;
  settings: Settings;
  categories: Category[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  damages: Damage[];
  employees: Employee[];
  payroll: Payroll[];
  debtPayments: DebtPayment[];
  supplierPayments: SupplierPayment[];
  cashSessions: CashSession[];
  refunds: Refund[];
  stockMovements: StockMovement[];
};

export const DB_VERSION = 1;
export const STORAGE_KEY = "nizam-pos-db-v1";

export const defaultSettings: Settings = {
  storeName: "",
  ownerName: "",
  address: "",
  wilaya: "",
  phone: "",
  email: "",
  rc: "",
  nif: "",
  nis: "",
  ai: "",
  rib: "",
  tvaRate: 19,
  tvaEnabled: false,
  stampDuty: false,
  currency: "DZD",
  lowStock: 5,
  receiptFooter: "",
  printWidth: "80",
  logo: "",
  logoOnReceipt: true,
  loyaltyEnabled: false,
  loyaltyEarnPer: 100,
  loyaltyPointValue: 1,
};

export const emptyDB = (): DB => ({
  version: DB_VERSION,
  settings: { ...defaultSettings },
  categories: [],
  products: [],
  customers: [],
  suppliers: [],
  sales: [],
  purchases: [],
  expenses: [],
  damages: [],
  employees: [],
  payroll: [],
  debtPayments: [],
  supplierPayments: [],
  cashSessions: [],
  refunds: [],
  stockMovements: [],
});

export const uid = (): ID =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function loadDB(): DB {
  if (typeof window === "undefined") return emptyDB();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      ...emptyDB(),
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
      version: DB_VERSION,
    };
  } catch {
    return emptyDB();
  }
}

export function saveDB(db: DB) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded — ignore, the UI keeps working in memory */
  }
}

/* ---------- derived helpers (pure functions, easy to test) ---------- */

export const saleDue = (s: Sale) => Math.max(0, round2(saleNetTotal(s) - s.paid));

/** Fraction of the sale's gross value that has been refunded (0..1). */
export const saleRefundRatio = (s: Sale) => {
  if (s.status === "returned") return 1;
  const gross = s.lines.reduce((sum, l) => sum + round2(l.qty * l.price - l.discount), 0);
  if (gross <= 0) return 0;
  const refundedGross = s.lines.reduce(
    (sum, l) => sum + round2((l.refundedQty ?? 0) * l.price - l.discount * ((l.refundedQty ?? 0) / l.qty)),
    0,
  );
  return Math.min(1, Math.max(0, refundedGross / gross));
};

/** Amount of money refunded on a sale (all-inclusive of discount / TVA / stamp). */
export const saleRefundedTotal = (s: Sale) => round2(s.total * saleRefundRatio(s));

/** Net revenue that remains from a sale after its refunds. */
export const saleNetTotal = (s: Sale) => round2(s.total - saleRefundedTotal(s));

/** True when the sale has been returned (fully or partially). */
export const saleHasRefund = (s: Sale) => s.status === "returned" || saleRefundedTotal(s) > 0;

/** UI/status key — keeps legacy "returned" sales and new partial refunds distinct. */
export const saleStatusKey = (s: Sale): "done" | "held" | "returned" | "partial" =>
  s.status === "returned"
    ? "returned"
    : s.status === "held"
      ? "held"
      : saleRefundRatio(s) > 0
        ? "partial"
        : "done";

export const customerDebt = (db: DB, customerId: ID) => {
  const owed = db.sales
    .filter((s) => s.customerId === customerId && s.status === "done")
    .reduce((sum, s) => sum + saleDue(s), 0);
  const paid = db.debtPayments
    .filter((p) => p.customerId === customerId)
    .reduce((sum, p) => sum + p.amount, 0);
  return round2(owed - paid);
};

export const supplierDebt = (db: DB, supplierId: ID) => {
  const owed = db.purchases
    .filter((p) => p.supplierId === supplierId)
    .reduce((sum, p) => sum + (p.total - p.paid), 0);
  const paid = db.supplierPayments
    .filter((p) => p.supplierId === supplierId)
    .reduce((sum, p) => sum + p.amount, 0);
  return round2(owed - paid);
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const isSameDay = (iso: string, ref = new Date()) =>
  new Date(iso).toDateString() === ref.toDateString();

export const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export const saleCost = (s: Sale) => s.lines.reduce((sum, l) => sum + l.cost * l.qty, 0);

/** Cost of the goods that remain sold (refunded items are back in stock). */
export const saleNetCost = (s: Sale) =>
  s.lines.reduce((sum, l) => sum + l.cost * (l.qty - (l.refundedQty ?? 0)), 0);

export const saleProfit = (s: Sale) =>
  round2(
    saleNetTotal(s) -
      s.tva * (1 - saleRefundRatio(s)) -
      s.stamp * (1 - saleRefundRatio(s)) -
      saleNetCost(s),
  );

/** Next auto reference, e.g. REF-0007 */
export const nextRef = (db: DB) => {
  const nums = db.products
    .map((p) => Number(/(\d+)\s*$/.exec(p.ref ?? "")?.[1] ?? 0))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `REF-${String(next).padStart(4, "0")}`;
};

export const stockValue = (db: DB) =>
  round2(db.products.reduce((sum, p) => sum + p.stock * p.buy, 0));

export const lowStockItems = (db: DB) =>
  db.products.filter((p) => !p.archived && p.stock <= (p.minStock || db.settings.lowStock));

export const expiringItems = (db: DB, days = 30) => {
  const limit = Date.now() + days * 864e5;
  return db.products.filter(
    (p) => p.expiry && new Date(p.expiry).getTime() <= limit && !p.archived,
  );
};

/**
 * Derive a product's stock from its movements:
 *   - the most recent `stocktake` (absolute) movement sets the base;
 *   - every movement AFTER it adds its signed qty;
 *   - if there is no stocktake, all delta movements sum from 0.
 *
 * Records with no movements fall back to the value stored on the product
 * (legacy data that predates the movement ledger).
 */
export function derivedStock(db: DB, productId: ID): number {
  const moves = db.stockMovements
    .filter((m) => m.productId === productId)
    .sort((a, b) => (a.ts === b.ts ? (a.id < b.id ? -1 : 1) : a.ts < b.ts ? -1 : 1));
  if (moves.length === 0) {
    return db.products.find((p) => p.id === productId)?.stock ?? 0;
  }
  let lastTakeIdx = -1;
  let lastTakeQty = 0;
  moves.forEach((m, i) => {
    if (m.type === "stocktake") {
      lastTakeIdx = i;
      lastTakeQty = m.qty;
    }
  });
  let stock = lastTakeIdx < 0 ? 0 : lastTakeQty;
  for (let i = lastTakeIdx + 1; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== "stocktake") stock = round2(stock + m.qty);
  }
  return round2(stock);
}