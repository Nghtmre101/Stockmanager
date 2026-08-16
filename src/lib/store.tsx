import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  customerDebt,
  emptyDB,
  loadDB,
  round2,
  saveDB,
  supplierDebt,
  uid,
  nextRef,
  type CashSession,
  type Category,
  type Customer,
  type DB,
  type Damage,
  type Employee,
  type Expense,
  type ID,
  type PayMethod,
  type Payroll,
  type Product,
  type Purchase,
  type PurchaseLine,
  type Refund,
  type Sale,
  type SaleLine,
  type Settings,
  type Supplier,
} from "./db";
import { backupCfg, createLocalBackup, restoreFromBackup, sendBackupToTelegram } from "./backup";
import {
  queueChange,
  queueDelete,
  subscribeSync,
  syncLocalState,
  type SyncEvent,
  type SyncKind,
} from "./sync";
import type { Lang } from "./app-context";

type CheckoutInput = {
  lines: SaleLine[];
  discount: number;
  paid: number;
  method: PayMethod;
  customerId?: ID;
  user: string;
  note?: string;
  hold?: boolean;
  /** Loyalty points the customer redeems on this ticket. */
  pointsSpent?: number;
};

type Store = {
  db: DB;
  ready: boolean;
  /* settings */
  saveSettings: (patch: Partial<Settings>) => void;
  /* catalogue */
  upsertCategory: (c: Partial<Category> & { name: string; id?: ID }) => Category;
  removeCategory: (id: ID) => void;
  nextRef: () => string;
  upsertProduct: (p: Partial<Product> & { name: string; id?: ID }) => Product;
  removeProduct: (id: ID) => void;
  adjustStock: (id: ID, newQty: number) => void;
  findByBarcode: (code: string) => Product | undefined;
  /* people */
  upsertCustomer: (c: Partial<Customer> & { name: string; id?: ID }) => Customer;
  removeCustomer: (id: ID) => void;
  upsertSupplier: (s: Partial<Supplier> & { name: string; id?: ID }) => Supplier;
  removeSupplier: (id: ID) => void;
  upsertEmployee: (e: Partial<Employee> & { name: string; id?: ID }) => Employee;
  removeEmployee: (id: ID) => void;
  /* operations */
  checkout: (input: CheckoutInput) => Sale;
  resumeSale: (id: ID) => Sale | undefined;
  /**
   * Refund one or more products from a completed sale.
   * `lines` lists each product and how many units to give back.
   */
  refundSale: (
    id: ID,
    lines: { productId: ID; qty: number }[],
    user?: string,
    note?: string,
  ) => Sale | undefined;
  addPurchase: (input: {
    lines: PurchaseLine[];
    supplierId?: ID;
    paid: number;
    note?: string;
  }) => Purchase;
  addExpense: (e: Omit<Expense, "id" | "date"> & { date?: string }) => void;
  removeExpense: (id: ID) => void;
  addDamage: (d: Omit<Damage, "id" | "date"> & { date?: string }) => void;
  payDebt: (customerId: ID, amount: number, note?: string) => void;
  paySupplier: (supplierId: ID, amount: number, note?: string) => void;
  addPayroll: (p: Omit<Payroll, "id" | "date"> & { date?: string }) => void;
  /* cashbox */
  openSession: (opening: number, user: string) => void;
  closeSession: (counted: number) => CashSession | undefined;
  currentSession: CashSession | undefined;
  /* debts */
  debtOf: (customerId: ID) => number;
  supplierDebtOf: (supplierId: ID) => number;
  /* maintenance */
  exportJSON: () => void;
  importJSON: (file: File) => Promise<void>;
  restoreJSON: (file: File) => Promise<void>;
  exportCSV: (kind: "sales" | "products" | "expenses" | "debts") => void;
  exportExcel: (kind: ExcelReport, lang?: Lang) => Promise<void>;
  resetAll: () => void;
};

export type ExcelReport =
  | "all"
  | "sales"
  | "products"
  | "purchases"
  | "expenses"
  | "debts"
  | "customers"
  | "suppliers"
  | "staff";

const Ctx = createContext<Store | null>(null);

/**
 * Safely merge a remote record (from the sync engine) into a local DB object.
 *
 * Local-first rules:
 *  - A remote tombstone NEVER deletes local data (returns the same reference).
 *  - Settings are merged field-by-field — the local object is kept and only
 *    missing fields are filled from the remote copy (local wins).
 *  - For every other collection a record is ONLY appended when no local record
 *    with the same id exists. If the id already exists locally, the local copy
 *    is kept (pending queue already wins) and we return the same reference.
 *
 * Returns the same `db` reference when no change is needed, which lets callers
 * skip React re-renders cheaply.
 */
function mergeRemoteRecord(db: DB, e: SyncEvent & { type: "remoteMerge" }): DB {
  const { kind, refId, remote, isDelete } = e;

  if (kind === "settings") {
    if (isDelete) return db;
    const mergedSettings = { ...db.settings, ...(remote as Partial<Settings>) };
    return JSON.stringify(mergedSettings) === JSON.stringify(db.settings)
      ? db
      : { ...db, settings: mergedSettings as Settings };
  }

  const key = collectionKeyForKind(kind);
  if (!key) return db;
  const arr = db[key] as Array<{ id: string }>;
  const existing = arr.find((r) => r.id === refId);

  if (isDelete) {
    if (!existing) return db;
    return { ...db, [key]: arr.filter((r) => r.id !== refId) };
  }

  const rec = { ...remote, id: refId } as { id: string };
  if (existing) {
    const merged = { ...existing, ...rec };
    if (JSON.stringify(merged) === JSON.stringify(existing)) return db;
    return { ...db, [key]: arr.map((r) => (r.id === refId ? merged : r)) };
  }
  return { ...db, [key]: [...arr, rec] };
}

/** Map a sync kind to its local DB collection key. */
function collectionKeyForKind(kind: SyncKind): keyof DB | null {
  switch (kind) {
    case "product":
      return "products";
    case "category":
      return "categories";
    case "sale":
      return "sales";
    case "refund":
      return "refunds";
    case "stockMovement":
      return "stockMovements";
    case "purchase":
      return "purchases";
    case "customer":
      return "customers";
    case "supplier":
      return "suppliers";
    case "employee":
    case "user":
      return "employees";
    case "expense":
      return "expenses";
    case "damage":
      return "damages";
    case "payroll":
      return "payroll";
    case "debtPayment":
      return "debtPayments";
    case "supplierPayment":
      return "supplierPayments";
    case "cashSession":
      return "cashSessions";
    default:
      return null; // settings / activity / restoreLog handled separately or skipped
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => emptyDB());
  const [ready, setReady] = useState(false);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    setDb(loadDB());
    setReady(true);
  }, []);

  // Keep the sync engine's local snapshot in sync with every DB change so any
  // remote merges apply on top of the freshest local state.
  useEffect(() => {
    if (!ready) return;
    syncLocalState(dbRef.current);
  }, [db, ready]);

  // Apply remote records merged by the sync engine into the React store.
  // Local-first: a remote record is ONLY added when no local record with the
  // same id exists (local always wins), tombstones NEVER delete local data,
  // and settings are merged field-by-field without blanking local values.
  useEffect(() => {
    if (!ready) return;
    return subscribeSync((e) => {
      if (e.type !== "remoteMerge") return;
      setDb((d) => {
        const next = mergeRemoteRecord(d, e);
        return next === d ? d : next;
      });
    });
  }, [ready]);

  /*
   * Persisting means serialising the whole database, which is far too heavy to
   * run on every keystroke — that was the source of the UI stutter. Writes are
   * coalesced into a short debounce and flushed when the page is hidden so no
   * data is lost when the app is closed or backgrounded.
   */
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => saveDB(db), 400);
    return () => window.clearTimeout(id);
  }, [db, ready]);

  useEffect(() => {
    if (!ready) return;
    const flush = () => saveDB(dbRef.current);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const saveExitBackup = () => {
      try {
        createLocalBackup(JSON.stringify(dbRef.current));
      } catch {
        /* best effort */
      }
    };
    window.addEventListener("beforeunload", saveExitBackup);
    window.addEventListener("pagehide", saveExitBackup);
    return () => {
      window.removeEventListener("beforeunload", saveExitBackup);
      window.removeEventListener("pagehide", saveExitBackup);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    const performBackup = async () => {
      const json = JSON.stringify(dbRef.current);
      try {
        createLocalBackup(json);
      } catch {
        /* best effort */
      }

      const cfg = backupCfg.telegram.get();
      if (!cfg.botToken || !cfg.chatId) return;

      try {
        await sendBackupToTelegram(json);
      } catch (error) {
        // Local save already succeeded above — Telegram is best-effort.
        console.warn("[telegram] background backup failed (local data intact)", {
          message:
            typeof error === "object" && error && "message" in error
              ? (error as { message?: string }).message
              : String(error),
        });
      }
    };

    void performBackup();
    const id = window.setInterval(
      () => {
        void performBackup();
      },
      60 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [ready]);

  // keep multiple tabs / windows in sync
  useEffect(() => {
    const onStorage = () => setDb(loadDB());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const patch = useCallback((fn: (d: DB) => DB) => setDb((d) => fn(d)), []);
  const now = () => new Date().toISOString();
  const nextNo = (arr: { no: number }[]) => arr.reduce((m, x) => Math.max(m, x.no), 0) + 1;

  const value = useMemo<Store>(() => {
    const upsertProduct: Store["upsertProduct"] = (p) => {
      const id = p.id ?? uid();
      const existing = dbRef.current.products.find((x) => x.id === id);
      const product: Product = {
        id,
        ref: p.ref ?? existing?.ref ?? nextRef(dbRef.current),
        name: p.name,
        image: p.image ?? existing?.image,
        barcode: p.barcode ?? "",
        category: p.category ?? "",
        unit: p.unit ?? "",
        buy: p.buy ?? 0,
        wholesale: p.wholesale ?? 0,
        price: p.price ?? 0,
        stock: p.stock ?? 0,
        minStock: p.minStock ?? 0,
        expiry: p.expiry,
        supplierId: p.supplierId,
        archived: p.archived,
      };
      patch((d) => ({
        ...d,
        products: d.products.some((x) => x.id === id)
          ? d.products.map((x) => (x.id === id ? { ...x, ...product } : x))
          : [...d.products, product],
      }));
      queueChange("product", id, product);
      return product;
    };

    const upsertCategory: Store["upsertCategory"] = (c) => {
      const id = c.id ?? uid();
      const rec: Category = {
        id,
        name: c.name,
        color: c.color ?? "#6366f1",
        note: c.note ?? "",
      };
      patch((d) => ({
        ...d,
        categories: d.categories.some((x) => x.id === id)
          ? d.categories.map((x) => (x.id === id ? rec : x))
          : [...d.categories, rec],
      }));
      queueChange("category", id, rec);
      return rec;
    };

    const upsertCustomer: Store["upsertCustomer"] = (c) => {
      const id = c.id ?? uid();
      const existing = dbRef.current.customers.find((x) => x.id === id);
      const rec: Customer = {
        id,
        name: c.name,
        phone: c.phone ?? "",
        note: c.note ?? "",
        wholesale: c.wholesale ?? false,
        creditLimit: c.creditLimit ?? 0,
        points: c.points ?? existing?.points ?? 0,
      };
      patch((d) => ({
        ...d,
        customers: d.customers.some((x) => x.id === id)
          ? d.customers.map((x) => (x.id === id ? rec : x))
          : [...d.customers, rec],
      }));
      queueChange("customer", id, rec);
      return rec;
    };

    const upsertSupplier: Store["upsertSupplier"] = (s) => {
      const id = s.id ?? uid();
      const rec: Supplier = { id, name: s.name, phone: s.phone ?? "", note: s.note ?? "" };
      patch((d) => ({
        ...d,
        suppliers: d.suppliers.some((x) => x.id === id)
          ? d.suppliers.map((x) => (x.id === id ? rec : x))
          : [...d.suppliers, rec],
      }));
      queueChange("supplier", id, rec);
      return rec;
    };

    const upsertEmployee: Store["upsertEmployee"] = (e) => {
      const id = e.id ?? uid();
      const rec: Employee = {
        id,
        name: e.name,
        role: e.role ?? "",
        phone: e.phone ?? "",
        salary: e.salary ?? 0,
        hired: e.hired ?? now().slice(0, 10),
      };
      patch((d) => ({
        ...d,
        employees: d.employees.some((x) => x.id === id)
          ? d.employees.map((x) => (x.id === id ? rec : x))
          : [...d.employees, rec],
      }));
      queueChange("employee", id, rec);
      return rec;
    };

    const checkout: Store["checkout"] = (input) => {
      const current = dbRef.current;
      const s = current.settings;
      const subtotal = round2(
        input.lines.reduce((sum, l) => sum + l.qty * l.price - l.discount, 0),
      );
      const net = round2(Math.max(0, subtotal - input.discount));
      const tva = s.tvaEnabled ? round2((net * s.tvaRate) / 100) : 0;
      const stampBase = round2(net + tva);
      const stamp = s.stampDuty && input.method === "cash" ? round2(stampBase * 0.01) : 0;
      const total = round2(net + tva + stamp);

      /* ---- loyalty ---- */
      const buyer = input.customerId
        ? current.customers.find((c) => c.id === input.customerId)
        : undefined;
      const loyaltyOn = s.loyaltyEnabled && !!buyer && !input.hold;
      const pointsSpent = loyaltyOn
        ? Math.max(0, Math.min(Math.floor(input.pointsSpent ?? 0), buyer?.points ?? 0))
        : 0;
      const pointsEarned =
        loyaltyOn && s.loyaltyEarnPer > 0 ? Math.floor(total / s.loyaltyEarnPer) : 0;

      const sale: Sale = {
        id: uid(),
        no: nextNo(current.sales),
        date: now(),
        lines: input.lines,
        subtotal,
        discount: input.discount,
        tva,
        stamp,
        total,
        paid: input.hold ? 0 : round2(Math.min(input.paid, total)),
        method: input.method,
        customerId: input.customerId,
        user: input.user,
        status: input.hold ? "held" : "done",
        note: input.note,
        pointsEarned: pointsEarned || undefined,
        pointsSpent: pointsSpent || undefined,
      };
      patch((d) => ({
        ...d,
        sales: [sale, ...d.sales],
        customers:
          pointsEarned || pointsSpent
            ? d.customers.map((c) =>
                c.id === input.customerId
                  ? { ...c, points: Math.max(0, (c.points ?? 0) - pointsSpent + pointsEarned) }
                  : c,
              )
            : d.customers,
        products: input.hold
          ? d.products
          : d.products.map((p) => {
              const line = input.lines.find((l) => l.productId === p.id);
              return line ? { ...p, stock: round2(p.stock - line.qty) } : p;
            }),
      }));
      /* ---- sync: sale + affected products + customer points ---- */
      queueChange("sale", sale.id, sale);
      if (!input.hold) {
        for (const line of input.lines) {
          const p = current.products.find((x) => x.id === line.productId);
          if (p) queueChange("product", p.id, { ...p, stock: round2(p.stock - line.qty) });
        }
      }
      if ((pointsEarned || pointsSpent) && buyer && input.customerId) {
        queueChange("customer", buyer.id, {
          ...buyer,
          points: Math.max(0, (buyer.points ?? 0) - pointsSpent + pointsEarned),
        });
      }
      return sale;
    };

    const resumeSale: Store["resumeSale"] = (id) => {
      const sale = dbRef.current.sales.find((s) => s.id === id);
      if (!sale) return undefined;
      patch((d) => ({ ...d, sales: d.sales.filter((s) => s.id !== id) }));
      queueDelete("sale", id);
      return sale;
    };

    const refundSale: Store["refundSale"] = (id, lines, user = "", note) => {
      const current = dbRef.current;
      const sale = current.sales.find((s) => s.id === id);
      if (!sale || sale.status !== "done") return undefined;

      // Merge duplicate picks and validate them against the refundable qty.
      const picks = new Map<string, number>();
      for (const p of lines ?? []) {
        if (!p || p.qty <= 0) continue;
        picks.set(p.productId, (picks.get(p.productId) ?? 0) + p.qty);
      }
      if (picks.size === 0) return undefined;
      const merged = [...picks.entries()].map(([productId, qty]) => ({ productId, qty }));
      for (const m of merged) {
        const line = sale.lines.find((l) => l.productId === m.productId);
        if (!line || m.qty > line.qty - (line.refundedQty ?? 0)) return undefined;
      }

      /* Money refunded: each returned line keeps its share of the ticket's
         line discount, and the total refund carries the same proportion of
         TVA / stamp duty as the goods it covers. */
      const gross = sale.lines.reduce((sum, l) => sum + round2(l.qty * l.price - l.discount), 0);
      const refundedLines = merged
        .map((m) => {
          const line = sale.lines.find((l) => l.productId === m.productId);
          return line ? { line, qty: m.qty } : null;
        })
        .filter((r): r is { line: SaleLine; qty: number } => r !== null);
      const refundedGross = refundedLines.reduce(
        (sum, r) => sum + round2(r.qty * r.line.price - r.line.discount * (r.qty / r.line.qty)),
        0,
      );
      const moneyRatio = gross > 0 ? refundedGross / gross : 0;
      const refundMoney = round2(sale.total * moneyRatio);

      const allReturned =
        sale.lines.length > 0 &&
        sale.lines.every(
          (l) => (l.refundedQty ?? 0) + (refundedLines.find((r) => r.line.productId === l.productId)?.qty ?? 0) >= l.qty,
        );

      const refund: Refund = {
        id: uid(),
        saleId: sale.id,
        date: now(),
        user,
        lines: refundedLines.map((r) => ({
          productId: r.line.productId,
          name: r.line.name,
          qty: r.qty,
          price: r.line.price,
          refunded: round2(r.qty * r.line.price - r.line.discount * (r.qty / r.line.qty)),
        })),
        total: refundMoney,
        note,
      };

      const patchedSale: Sale = {
        ...sale,
        lines: sale.lines.map((l) => {
          const r = refundedLines.find((x) => x.line.productId === l.productId);
          return r ? { ...l, refundedQty: round2((l.refundedQty ?? 0) + r.qty) } : l;
        }),
        // Fully returned tickets keep the legacy "returned" status so old
        // reports keep working; partial returns stay "done" with refundedQty.
        status: allReturned ? "returned" : sale.status,
      };

      patch((d) => ({
        ...d,
        refunds: [refund, ...d.refunds],
        sales: d.sales.map((s) => (s.id === sale.id ? patchedSale : s)),
        // Restock exactly the returned goods.
        products: d.products.map((p) => {
          const r = refundedLines.find((x) => x.line.productId === p.id);
          return r ? { ...p, stock: round2(p.stock + r.qty) } : p;
        }),
        // Reverse the loyalty movement proportionally to the returned share.
        customers:
          sale.customerId && (sale.pointsEarned || sale.pointsSpent)
            ? d.customers.map((c) =>
                c.id === sale.customerId
                  ? {
                      ...c,
                      points: Math.max(
                        0,
                        round2(
                          (c.points ?? 0) +
                            (sale.pointsSpent ?? 0) * moneyRatio -
                            (sale.pointsEarned ?? 0) * moneyRatio,
                        ),
                      ),
                    }
                  : c,
              )
            : d.customers,
      }));

      /* ---- sync: refund record + updated sale + restocked products + points ---- */
      queueChange("refund", refund.id, refund);
      queueChange("sale", sale.id, patchedSale);
      for (const r of refundedLines) {
        const p = current.products.find((x) => x.id === r.line.productId);
        if (p) queueChange("product", p.id, { ...p, stock: round2(p.stock + r.qty) });
      }
      if (sale.customerId && (sale.pointsEarned || sale.pointsSpent)) {
        const c = current.customers.find((x) => x.id === sale.customerId);
        if (c) {
          queueChange("customer", c.id, {
            ...c,
            points: Math.max(
              0,
              round2((c.points ?? 0) + (sale.pointsSpent ?? 0) * moneyRatio - (sale.pointsEarned ?? 0) * moneyRatio),
            ),
          });
        }
      }
      return patchedSale;
    };

    const addPurchase: Store["addPurchase"] = ({ lines, supplierId, paid, note }) => {
      const current = dbRef.current;
      const total = round2(lines.reduce((sum, l) => sum + l.qty * l.buy, 0));
      const purchase: Purchase = {
        id: uid(),
        no: nextNo(current.purchases),
        date: now(),
        supplierId,
        lines,
        total,
        paid: round2(paid),
        note,
      };
      const products = [...current.products];
      for (const line of lines) {
        const idx = products.findIndex(
          (p) =>
            (line.productId && p.id === line.productId) ||
            (line.barcode && p.barcode && p.barcode === line.barcode) ||
            p.name.trim().toLowerCase() === line.name.trim().toLowerCase(),
        );
        if (idx >= 0) {
          const p = products[idx];
          products[idx] = {
            ...p,
            stock: round2(p.stock + line.qty),
            buy: line.buy || p.buy,
            wholesale: line.wholesale || p.wholesale,
            price: line.sell || p.price,
            barcode: line.barcode || p.barcode,
            supplierId: supplierId ?? p.supplierId,
          };
        } else {
          products.push({
            id: uid(),
            ref: nextRef({ ...current, products }),
            name: line.name,
            barcode: line.barcode,
            category: "",
            unit: "",
            buy: line.buy,
            wholesale: line.wholesale,
            price: line.sell,
            stock: line.qty,
            minStock: 0,
            supplierId,
          });
        }
      }
      patch((d) => ({ ...d, purchases: [purchase, ...d.purchases], products }));
      /* ---- sync: purchase + affected / created products ---- */
      queueChange("purchase", purchase.id, purchase);
      for (const p of products) {
        const prev = current.products.find((x) => x.id === p.id);
        if (
          !prev ||
          prev.stock !== p.stock ||
          prev.buy !== p.buy ||
          prev.price !== p.price ||
          prev.wholesale !== p.wholesale ||
          prev.barcode !== p.barcode ||
          prev.supplierId !== p.supplierId
        ) {
          queueChange("product", p.id, p);
        }
      }
      return purchase;
    };

    return {
      db,
      ready,
      saveSettings: (p) => {
        patch((d) => ({ ...d, settings: { ...d.settings, ...p } }));
        queueChange("settings", "main", { ...dbRef.current.settings, ...p });
      },
      upsertCategory,
      removeCategory: (id) => {
        patch((d) => ({
          ...d,
          categories: d.categories.filter((c) => c.id !== id),
        }));
        queueDelete("category", id);
      },
      nextRef: () => nextRef(dbRef.current),
      upsertProduct,
      removeProduct: (id) => {
        patch((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
        queueDelete("product", id);
      },
      adjustStock: (id, newQty) => {
        const prev = dbRef.current.products.find((p) => p.id === id);
        patch((d) => ({
          ...d,
          products: d.products.map((p) => (p.id === id ? { ...p, stock: round2(newQty) } : p)),
        }));
        if (prev) queueChange("product", id, { ...prev, stock: round2(newQty) });
      },
      findByBarcode: (code) =>
        dbRef.current.products.find((p) => p.barcode && p.barcode === code.trim()),
      upsertCustomer,
      removeCustomer: (id) => {
        patch((d) => ({ ...d, customers: d.customers.filter((c) => c.id !== id) }));
        queueDelete("customer", id);
      },
      upsertSupplier,
      removeSupplier: (id) => {
        patch((d) => ({ ...d, suppliers: d.suppliers.filter((s) => s.id !== id) }));
        queueDelete("supplier", id);
      },
      upsertEmployee,
      removeEmployee: (id) => {
        patch((d) => ({ ...d, employees: d.employees.filter((e) => e.id !== id) }));
        queueDelete("employee", id);
      },
      checkout,
      resumeSale,
      refundSale,
      addPurchase,
      addExpense: (e) => {
        const rec = { ...e, id: uid(), date: e.date ?? now() };
        patch((d) => ({
          ...d,
          expenses: [rec, ...d.expenses],
        }));
        queueChange("expense", rec.id, rec);
      },
      removeExpense: (id) => {
        patch((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));
        queueDelete("expense", id);
      },
      addDamage: (dm) => {
        const rec = { ...dm, id: uid(), date: dm.date ?? now() };
        const prev = dbRef.current.products.find((p) => p.id === dm.productId);
        patch((d) => ({
          ...d,
          damages: [rec, ...d.damages],
          products: d.products.map((p) =>
            p.id === dm.productId ? { ...p, stock: round2(p.stock - dm.qty) } : p,
          ),
        }));
        queueChange("damage", rec.id, rec);
        if (prev) queueChange("product", prev.id, { ...prev, stock: round2(prev.stock - dm.qty) });
      },
      payDebt: (customerId, amount, note) => {
        const rec = {
          id: uid(),
          date: now(),
          customerId,
          amount: round2(amount),
          note: note ?? "",
        };
        patch((d) => ({
          ...d,
          debtPayments: [rec, ...d.debtPayments],
        }));
        queueChange("debtPayment", rec.id, rec);
      },
      paySupplier: (supplierId, amount, note) => {
        const rec = {
          id: uid(),
          date: now(),
          supplierId,
          amount: round2(amount),
          note: note ?? "",
        };
        patch((d) => ({
          ...d,
          supplierPayments: [rec, ...d.supplierPayments],
        }));
        queueChange("supplierPayment", rec.id, rec);
      },
      addPayroll: (p) => {
        const rec = { ...p, id: uid(), date: p.date ?? now() };
        patch((d) => ({
          ...d,
          payroll: [rec, ...d.payroll],
        }));
        queueChange("payroll", rec.id, rec);
      },
      openSession: (opening, user) => {
        const rec = { id: uid(), openedAt: now(), opening: round2(opening), user };
        patch((d) => ({
          ...d,
          cashSessions: [rec, ...d.cashSessions],
        }));
        queueChange("cashSession", rec.id, rec);
      },
      closeSession: (counted) => {
        const open = dbRef.current.cashSessions.find((s) => !s.closedAt);
        if (!open) return undefined;
        const closed: CashSession = { ...open, closedAt: now(), counted: round2(counted) };
        patch((d) => ({
          ...d,
          cashSessions: d.cashSessions.map((s) => (s.id === open.id ? closed : s)),
        }));
        queueChange("cashSession", closed.id, closed);
        return closed;
      },
      currentSession: db.cashSessions.find((s) => !s.closedAt),
      debtOf: (id) => customerDebt(db, id),
      supplierDebtOf: (id) => supplierDebt(db, id),
      exportJSON: () => {
        const blob = new Blob([JSON.stringify(dbRef.current, null, 2)], {
          type: "application/json",
        });
        download(blob, `nizam-backup-${new Date().toISOString().slice(0, 10)}.json`);
      },
      importJSON: async (file) => {
        const text = await file.text();
        const parsed = JSON.parse(text) as DB;
        setDb({ ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...parsed.settings } });
      },
      restoreJSON: async (file) => {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const restored = restoreFromBackup(dbRef.current, parsed, { reason: "backup" });
        if (!restored?.db) {
          throw new Error("invalid_backup");
        }
        setDb(restored.db as DB);
      },
      exportCSV: (kind) => {
        const d = dbRef.current;
        let rows: (string | number)[][] = [];
        if (kind === "sales")
          rows = [
            ["no", "date", "total", "paid", "method", "customer", "items"],
            ...d.sales.map((s) => [
              s.no,
              s.date,
              s.total,
              s.paid,
              s.method,
              d.customers.find((c) => c.id === s.customerId)?.name ?? "",
              s.lines.length,
            ]),
          ];
        if (kind === "products")
          rows = [
            ["name", "barcode", "category", "buy", "wholesale", "price", "stock"],
            ...d.products.map((p) => [
              p.name,
              p.barcode,
              p.category,
              p.buy,
              p.wholesale,
              p.price,
              p.stock,
            ]),
          ];
        if (kind === "expenses")
          rows = [
            ["date", "amount", "category", "note"],
            ...d.expenses.map((e) => [e.date, e.amount, e.category, e.note]),
          ];
        if (kind === "debts")
          rows = [
            ["customer", "phone", "debt"],
            ...d.customers.map((c) => [c.name, c.phone, customerDebt(d, c.id)]),
          ];
        const csv =
          "\uFEFF" +
          rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
        download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `nizam-${kind}.csv`);
      },
      exportExcel: async (kind, lang) => {
        const { buildReports } = await import("./reports");
        await buildReports(dbRef.current, kind, lang ?? "fr");
      },
      resetAll: () => setDb(emptyDB()),
    };
  }, [db, ready, patch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
