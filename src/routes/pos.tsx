import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Gift,
  Minus,
  Percent,
  Plus,
  Printer,
  Receipt,
  Search,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { round2, saleDue, type PayMethod, type Sale, type SaleLine } from "@/lib/db";
import { invoiceHTML, printHTML, receiptHTML } from "@/lib/print";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal } from "@/components/ui-kit";
import { sfx } from "@/lib/sfx";
import { startScanSession, onScan, type ScanSession } from "@/lib/scanner";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale — Stock Manager" },
      {
        name: "description",
        content: "Fast touch-friendly checkout: scan, add items, and confirm sales in one screen.",
      },
      { property: "og:title", content: "Point of Sale — Stock Manager" },
      { property: "og:description", content: "Fast touch-friendly checkout for your store." },
    ],
  }),
  component: Pos,
});

type Line = { id: string; qty: number; price: number };

const methods: { v: PayMethod; k: "m_cash" | "m_credit" | "m_card" | "m_ccp" | "m_baridimob" }[] = [
  { v: "cash", k: "m_cash" },
  { v: "credit", k: "m_credit" },
  { v: "card", k: "m_card" },
  { v: "ccp", k: "m_ccp" },
  { v: "baridimob", k: "m_baridimob" },
];

function Pos() {
  const { t, lang } = useApp();
  const money = useMoney();
  const { db, checkout, findByBarcode, resumeSale, upsertCustomer } = useStore();
  const { user: authUser } = useAuth();

  const [cart, setCart] = useState<Line[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [customerId, setCustomerId] = useState("");
  const [paidInput, setPaidInput] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [newCustomer, setNewCustomer] = useState("");
  const [pointsInput, setPointsInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const sessionRef = useRef<ScanSession | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const named = db.categories.map((c) => c.name);
    const used = db.products.map((p) => p.category).filter(Boolean);
    return Array.from(new Set([...named, ...used]));
  }, [db.categories, db.products]);

  /** Quantity currently reserved in the ticket — used for live stock. */
  const inCart = (id: string) => cart.find((l) => l.id === id)?.qty ?? 0;
  /** Stock as the shopkeeper sees it right now: shelf minus the open ticket. */
  const liveStock = (id: string) =>
    round2((db.products.find((p) => p.id === id)?.stock ?? 0) - inCart(id));

  const customer = db.customers.find((c) => c.id === customerId);
  const priceOf = (id: string) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) return 0;
    return customer?.wholesale && p.wholesale ? p.wholesale : p.price;
  };

  const visible = useMemo(
    () =>
      db.products.filter(
        (p) =>
          !p.archived &&
          (cat === "" || p.category === cat) &&
          (p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q.trim())),
      ),
    [db.products, cat, q],
  );

  const subtotal = round2(cart.reduce((s, l) => s + l.qty * l.price, 0));
  /* Loyalty: points redeemed become an extra discount on the ticket. */
  const loyaltyOn = db.settings.loyaltyEnabled && !!customer;
  const availablePoints = customer?.points ?? 0;
  const wantPoints = Math.max(0, Math.floor(Number(pointsInput.replace(",", ".")) || 0));
  const usePoints = loyaltyOn ? Math.min(wantPoints, availablePoints) : 0;
  const pointsDisc = round2(usePoints * (db.settings.loyaltyPointValue || 0));
  const disc = Math.min((Number(discount.replace(",", ".")) || 0) + pointsDisc, subtotal);
  const net = round2(subtotal - disc);
  const tva = db.settings.tvaEnabled ? round2((net * db.settings.tvaRate) / 100) : 0;
  const stamp = db.settings.stampDuty && method === "cash" ? round2((net + tva) * 0.01) : 0;
  const total = round2(net + tva + stamp);
  const held = db.sales.filter((s) => s.status === "held");

  /* set when a barcode reader delivered the code, so Enter isn't handled twice */
  const scanHandled = useRef(false);

  const add = (id: string) =>
    setCart((c) =>
      c.some((l) => l.id === id)
        ? c.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
        : [...c, { id, qty: 1, price: priceOf(id) }],
    );

  /**
   * Open the camera scanner and KEEP IT OPEN: every barcode is added to the
   * cart immediately and the overlay shows a live counter plus the last item
   * scanned. The cashier closes it with the ✕ button when finished.
   */
  const doScan = async () => {
    if (scanning) return;
    if (sessionRef.current) {
      sessionRef.current.stop();
      return;
    }
    setScanning(true);
    try {
      const session = await startScanSession({
        title: t("scan_camera"),
        onClose: () => {
          sessionRef.current = null;
          setScanning(false);
        },
        onCode: (code) => {
          const hit = findByBarcode(code);
          if (hit) {
            add(hit.id);
            setQ("");
            sessionRef.current?.report(hit.name, true);
          } else {
            sfx.error();
            sessionRef.current?.report(`${code} — ${t("no_results")}`, false);
          }
        },
      });
      sessionRef.current = session;
    } catch (e) {
      setScanning(false);
      if (e instanceof Error && e.message === "cancelled") return; // user closed the scanner
      const denied = e instanceof Error && e.message === "camera-permission-denied";
      if (denied) {
        // Permission was denied (or isn't granted in system settings). Show a
        // clear, non-crashing message; the cashier can grant it or just type
        // the code / use the USB HID reader instead. The PC hardware scanner
        // path is unaffected — it listens via the global keydown handler.
        window.alert(t("camera_denied"));
      } else {
        // No camera / not supported on this device — let the cashier type the
        // barcode or use a USB HID reader in the search field instead.
        sfx.error();
        searchRef.current?.focus();
      }
    }
  };

  /* Always release the camera when leaving the POS screen. */
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const unsub = onScan((code) => {
      const hit = findByBarcode(code);
      if (hit) {
        add(hit.id);
        setQ("");
        sfx.scan();
      } else {
        setQ(code);
        sfx.error();
      }
      scanHandled.current = true;
      window.setTimeout(() => {
        scanHandled.current = false;
      }, 40);
    });
    return () => {
      unsub();
    };
  }, [findByBarcode, add]);

  const bump = (id: string, d: number) =>
    setCart((c) =>
      c.flatMap((l) => (l.id === id ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l])),
    );
  const reset = () => {
    setCart([]);
    setDiscount("");
    setPaidInput("");
    setCustomerId("");
    setPointsInput("");
    setMethod("cash");
  };

  const buildLines = (): SaleLine[] =>
    cart.map((l) => {
      const p = db.products.find((x) => x.id === l.id);
      return {
        productId: l.id,
        name: p?.name ?? "",
        qty: l.qty,
        price: l.price,
        cost: p?.buy ?? 0,
        discount: 0,
      };
    });

  const finish = (hold = false) => {
    if (cart.length === 0) { sfx.error(); return; }
    const paid = hold ? 0 : method === "credit" ? Number(paidInput.replace(",", ".")) || 0 : total;
    const sale = checkout({
      lines: buildLines(),
      discount: disc,
      paid,
      method,
      customerId: customerId || undefined,
      user: authUser?.username || authUser?.name || db.settings.ownerName || "manager",
      hold,
      pointsSpent: hold ? 0 : usePoints,
    });
    if (!hold) setLastSale(sale);
    setPayOpen(false);
    reset();
    if (hold) sfx.tap(); else sfx.cash();
    if (!hold && db.settings.printWidth !== "a4") {
      printHTML(receiptHTML(sale, db, lang));
    }
  };

  /* barcode scanner: a reader types fast then hits Enter */
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !q.trim()) return;
    if (scanHandled.current) {
      scanHandled.current = false;
      return;
    }
    const hit = findByBarcode(q) ?? visible[0];
    if (hit) {
      add(hit.id);
      setQ("");
      sfx.scan();
    } else {
      sfx.error();
    }
  };

  /* keyboard shortcuts, like the desktop apps shopkeepers are used to */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        reset();
        searchRef.current?.focus();
      }
      if (e.key === "F2") {
        e.preventDefault();
        setPayOpen(true);
      }
      if (e.key === "F3") {
        e.preventDefault();
        finish(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      {/* Catalog */}
      <section className="order-2 space-y-3 lg:order-1">
        <div className="flex items-center gap-2 surface-card px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder={t("search_ph")}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={doScan}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            title={t("scan_camera")}
          >
            <Camera className="h-4 w-4" />
            {scanning ? t("scan_stop") : t("scan_btn")}
          </button>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["", ...categories].map((c) => (
              <button
                key={c || "all"}
                onClick={() => setCat(c)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-xs font-bold transition",
                  c === cat
                    ? "brand-gradient text-primary-foreground glow-shadow"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                )}
              >
                {c || t("all_items")}
              </button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="surface-card">
            <EmptyState title={t("empty_products")} hint={t("empty_products_hint")} />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id)}
              className="group overflow-hidden surface-card text-left transition hover:-translate-y-0.5 hover:glow-shadow active:scale-[0.98]"
            >
              <div className="relative h-24 brand-gradient opacity-90">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
                <span className="absolute top-2 left-2 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-black">
                  {priceOf(p.id).toLocaleString()}
                </span>
                <span
                  className={cn(
                    "absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-black transition",
                    liveStock(p.id) > 0
                      ? "bg-success text-success-foreground"
                      : "bg-destructive text-destructive-foreground",
                  )}
                >
                  {liveStock(p.id)}
                </span>
                {inCart(p.id) > 0 ? (
                  <span className="absolute bottom-2 left-2 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-black text-background">
                    {t("in_cart")}: {inCart(p.id)}
                  </span>
                ) : null}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-xs font-bold">{p.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{p.ref}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Ticket */}
      <section className="order-1 space-y-3 lg:order-2">
        <div className="rounded-2xl bg-foreground p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-bold text-background/70">
              {db.products.find((p) => p.id === cart[0]?.id)?.name ?? t("cart_empty")}
            </p>
            <p className="shrink-0 text-[11px] font-bold text-background/60">
              {t("items_count")}: {cart.length}
            </p>
          </div>
          <p className="mt-1 truncate text-right font-mono text-5xl font-extrabold text-success lg:text-6xl">
            {total.toFixed(2)}
          </p>
        </div>

        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Btn tone="muted" onClick={() => setHeldOpen(true)}>
              <Timer className="h-4 w-4" /> {t("held_sales")} ({held.length})
            </Btn>
            <Btn tone="primary" onClick={reset}>
              <Sparkles className="h-4 w-4" /> {t("new_sale")} (F1)
            </Btn>
          </div>
          <div className="flex justify-center">
            <Btn
              tone="success"
              className="w-full max-w-[280px] py-4 text-base sm:text-lg"
              onClick={() => setPayOpen(true)}
              disabled={cart.length === 0}
            >
              <Check className="h-5 w-5" /> {t("confirm_sale")} (F2)
            </Btn>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div />
            <Btn tone="warning" onClick={() => finish(true)} disabled={cart.length === 0}>
              <Timer className="h-4 w-4" /> {t("hold")} (F3)
            </Btn>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="min-w-0 flex-1 surface-card px-3 py-2 text-sm font-semibold outline-none"
          >
            <option value="">{t("customer_name")}</option>
            {db.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.wholesale ? " ⋅ " + t("wholesale") : ""}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 surface-card px-2 py-1.5">
            <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={discount}
              inputMode="decimal"
              onChange={(e) => setDiscount(e.target.value)}
              placeholder={t("discount")}
              className="w-20 bg-transparent text-sm font-semibold outline-none"
            />
          </div>
          {loyaltyOn && (
            <div className="flex items-center gap-1 surface-card px-2 py-1.5">
              <Gift className="h-4 w-4 shrink-0 text-primary" />
              <input
                value={pointsInput}
                inputMode="numeric"
                onChange={(e) => setPointsInput(e.target.value)}
                placeholder={`${t("use_points")} (${availablePoints})`}
                className="w-28 bg-transparent text-sm font-semibold outline-none"
              />
            </div>
          )}
          <Btn
            tone="muted"
            disabled={!lastSale}
            onClick={() => lastSale && printHTML(receiptHTML(lastSale, db, lang))}
          >
            <Printer className="h-4 w-4" /> {t("receipt")}
          </Btn>
          <Btn
            tone="accent"
            disabled={!lastSale}
            onClick={() => lastSale && printHTML(invoiceHTML(lastSale, db, lang))}
          >
            <Receipt className="h-4 w-4" /> {t("invoice")}
          </Btn>
          <Btn tone="danger" onClick={() => setCart([])}>
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </Btn>
        </div>

        <div className="space-y-2">
          {cart.length === 0 && (
            <p className="surface-card p-8 text-center text-sm font-bold text-muted-foreground">
              {t("cart_empty")}
            </p>
          )}
          {cart.map((l) => {
            const p = db.products.find((x) => x.id === l.id);
            if (!p) return null;
            return (
              <div key={l.id} className="flex items-center gap-3 surface-card p-2.5">
                <button
                  onClick={() => bump(l.id, -l.qty)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
                <p className="w-24 shrink-0 font-mono text-sm font-black text-success">
                  {(l.price * l.qty).toLocaleString()}
                </p>
                <div className="flex shrink-0 items-center gap-1 rounded-full bg-secondary p-1">
                  <button
                    onClick={() => bump(l.id, -1)}
                    className="grid h-6 w-6 place-items-center rounded-full bg-card"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-black">{l.qty}</span>
                  <button
                    onClick={() => bump(l.id, 1)}
                    className="grid h-6 w-6 place-items-center rounded-full bg-card"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    {t("in_stock")}: {liveStock(l.id)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1 surface-card px-4 py-3 text-sm font-bold">
          <Line2 label={t("total")} value={money(subtotal)} />
          {disc > 0 && <Line2 label={t("discount")} value={`- ${money(disc)}`} />}
          {tva > 0 && <Line2 label={`TVA ${db.settings.tvaRate}%`} value={money(tva)} />}
          {stamp > 0 && <Line2 label={t("stamp_duty")} value={money(stamp)} />}
          {loyaltyOn && usePoints > 0 && (
            <Line2 label={`${t("use_points")} (${usePoints})`} value={`- ${money(pointsDisc)}`} />
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">{t("invoice_total")}</span>
            <span className="text-lg font-black text-primary">{money(total)}</span>
          </div>
        </div>
      </section>

      {/* Payment modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t("confirm_sale")}>
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <button
              key={m.v}
              onClick={() => setMethod(m.v)}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-black transition",
                method === m.v
                  ? "brand-gradient text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {t(m.k)}
            </button>
          ))}
        </div>
        <div className="rounded-2xl bg-secondary p-3 text-center">
          <p className="text-xs font-bold text-muted-foreground">{t("invoice_total")}</p>
          <p className="text-3xl font-black text-primary">{money(total)}</p>
        </div>
        {method === "credit" && (
          <>
            <Field
              label={t("paid_amount")}
              value={paidInput}
              inputMode="decimal"
              onChange={setPaidInput}
            />
            <p className="text-xs font-bold text-destructive">
              {t("remaining")}:{" "}
              {money(round2(Math.max(0, total - (Number(paidInput.replace(",", ".")) || 0))))}
            </p>
            {!customerId && (
              <div className="flex items-end gap-2">
                <Field
                  className="flex-1"
                  label={t("new_customer")}
                  value={newCustomer}
                  onChange={setNewCustomer}
                />
                <Btn
                  tone="muted"
                  onClick={() => {
                    if (!newCustomer.trim()) return;
                    const c = upsertCustomer({ name: newCustomer.trim() });
                    setCustomerId(c.id);
                    setNewCustomer("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Btn>
              </div>
            )}
          </>
        )}
        <div className="flex gap-2 pt-2">
          <Btn tone="success" className="flex-1 py-3" onClick={() => finish(false)}>
            <Check className="h-4 w-4" /> {t("confirm")}
          </Btn>
          <Btn tone="muted" onClick={() => setPayOpen(false)}>
            {t("cancel")}
          </Btn>
        </div>
      </Modal>

      {/* Held tickets */}
      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title={t("held_sales")}>
        {held.length === 0 && <EmptyState compact title={t("empty_table")} />}
        {held.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 surface-card p-3">
            <span className="text-xs font-bold">
              #{s.no} · {new Date(s.date).toLocaleTimeString()}
            </span>
            <span className="font-mono text-sm font-black">{money(s.total)}</span>
            <Btn
              tone="primary"
              onClick={() => {
                const sale = resumeSale(s.id);
                if (sale) {
                  setCart(
                    sale.lines.map((l) => ({ id: l.productId, qty: l.qty, price: l.price })),
                  );
                  setHeldOpen(false);
                }
              }}
            >
              {t("resume")}
            </Btn>
          </div>
        ))}
      </Modal>

      {/* Last sale receipt reminder */}
      {lastSale && saleDue(lastSale) > 0 && (
        <p className="fixed bottom-24 z-30 rounded-xl bg-warning px-3 py-2 text-xs font-black text-warning-foreground lg:bottom-6 left-4 ">
          {t("remaining")}: {money(saleDue(lastSale))}
        </p>
      )}
    </div>
  );
}

function Line2({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
