import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Barcode, Boxes, Camera, ImageIcon, Pencil, Printer, Search, Tag, Trash2 } from "lucide-react";
import { useApp, useMoney } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { labelsHTML, printHTML } from "@/lib/print";
import { scanBarcodeFromCamera, isCameraScanAvailable, onScan } from "@/lib/scanner";
import type { Product } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal, StatCard, Th } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Items & Stock — Stock Manager" },
      {
        name: "description",
        content:
          "Manage your catalogue: barcodes, categories, buy/wholesale/retail prices, stock alerts, expiry dates and stocktake.",
      },
      { property: "og:title", content: "Items & Stock — Stock Manager" },
      { property: "og:description", content: "Catalogue, pricing, stock alerts and stocktake." },
    ],
  }),
  component: Products,
});

const blank = {
  id: "",
  ref: "",
  autoRef: true,
  image: "" as string,
  name: "",
  barcode: "",
  category: "",
  unit: "",
  buy: "",
  wholesale: "",
  price: "",
  stock: "",
  minStock: "",
  expiry: "",
};

function Products() {
  const { t, lang } = useApp();
  const money = useMoney();
  const { db, upsertProduct, removeProduct, adjustStock, nextRef } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [mode, setMode] = useState<"all" | "low" | "expiring">("all");

  useEffect(() => {
    if (!open) return;
    const unsub = onScan((code) => setForm((form) => ({ ...form, barcode: code })));
    return () => {
      unsub();
    };
  }, [open]);

  const catNames = useMemo(() => {
    const named = db.categories.map((c) => c.name);
    const used = db.products.map((p) => p.category).filter(Boolean);
    return Array.from(new Set([...named, ...used]));
  }, [db.categories, db.products]);

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: String(reader.result) }));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const num = (v: string) => Number(String(v).replace(",", ".")) || 0;

  const list = useMemo(() => {
    const limit = Date.now() + 30 * 864e5;
    return db.products.filter((p) => {
      if (q && !(p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q.trim())))
        return false;
      if (mode === "low") return p.stock <= (p.minStock || db.settings.lowStock);
      if (mode === "expiring") return p.expiry && new Date(p.expiry).getTime() <= limit;
      return true;
    });
  }, [db.products, db.settings.lowStock, q, mode]);

  const stockValue = db.products.reduce((s, p) => s + p.stock * p.buy, 0);
  const retailValue = db.products.reduce((s, p) => s + p.stock * p.price, 0);

  const edit = (p: Product) => {
    setForm({
      id: p.id,
      ref: p.ref ?? "",
      autoRef: false,
      image: p.image ?? "",
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      unit: p.unit,
      buy: String(p.buy),
      wholesale: String(p.wholesale),
      price: String(p.price),
      stock: String(p.stock),
      minStock: String(p.minStock),
      expiry: p.expiry ?? "",
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    upsertProduct({
      id: form.id || undefined,
      ref: form.autoRef && !form.ref.trim() ? nextRef() : form.ref.trim(),
      image: form.image || undefined,
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      category: form.category.trim(),
      unit: form.unit.trim(),
      buy: num(form.buy),
      wholesale: num(form.wholesale),
      price: num(form.price),
      stock: num(form.stock),
      minStock: num(form.minStock),
      expiry: form.expiry || undefined,
    });
    setOpen(false);
    setForm(blank);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("items")} value={String(db.products.length)} tone="primary" icon={<Boxes className="h-4 w-4" />} />
        <StatCard label={t("stock_value")} value={money(stockValue)} tone="success" />
        <StatCard label={t("revenue")} value={money(retailValue)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 surface-card px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search_ph")}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        {(["all", "low", "expiring"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-full px-3 py-2 text-xs font-black transition",
              mode === m ? "brand-gradient text-primary-foreground" : "bg-secondary text-secondary-foreground",
            )}
          >
            {m === "all" ? t("all_items") : m === "low" ? t("low_stock") : t("expiring")}
          </button>
        ))}
        <Btn
          tone="accent"
          onClick={() =>
            printHTML(
              labelsHTML(
                list.map((p) => ({
                  name: p.name,
                  ref: p.ref,
                  barcode: p.barcode || p.ref || p.name,
                  price: p.price,
                })),
                db,
                lang,
              ),
            )
          }
          disabled={list.length === 0}
        >
          <Printer className="h-4 w-4" /> {t("labels")}
        </Btn>
        <Btn
          tone="success"
          onClick={() => {
            setForm(blank);
            setOpen(true);
          }}
        >
          <Tag className="h-4 w-4" /> {t("add_item")}
        </Btn>
      </div>

      <p className="px-1 text-[11px] font-bold text-muted-foreground">{t("stocktake_hint")}</p>

      <div className="overflow-x-auto surface-card">
        {list.length === 0 ? (
          <EmptyState title={t("empty_products")} hint={t("empty_products_hint")} />
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <Th
              cols={[
                t("item_ref"),
                t("item_name"),
                t("barcode"),
                t("category"),
                t("buy_price"),
                t("wholesale"),
                t("sell_price"),
                t("in_stock"),
                t("expiry"),
                t("actions"),
              ]}
            />
            <tbody>
              {list.map((p, i) => {
                const low = p.stock <= (p.minStock || db.settings.lowStock);
                return (
                  <tr key={p.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                    <td className="px-3 py-2 font-mono text-xs font-black text-muted-foreground">
                      {p.ref}
                    </td>
                    <td className="px-3 py-2 font-bold">
                      <span className="flex items-center gap-2">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.name}
                            loading="lazy"
                            className="h-8 w-8 shrink-0 rounded-lg object-cover"
                          />
                        ) : null}
                        {p.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.barcode}</td>
                    <td className="px-3 py-2 text-xs">{p.category}</td>
                    <td className="px-3 py-2 font-mono">{p.buy.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono">{p.wholesale.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-black text-primary">{p.price.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <input
                        value={p.stock}
                        inputMode="decimal"
                        onChange={(e) => adjustStock(p.id, num(e.target.value))}
                        className={cn(
                          "w-20 rounded-lg border border-input bg-background px-2 py-1 font-mono text-xs font-black outline-none",
                          low && "border-destructive text-destructive",
                        )}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.expiry ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => edit(p)} className="text-muted-foreground hover:text-primary">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => window.confirm(t("delete_confirm")) && removeProduct(p.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
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

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? t("edit") : t("add_item")}>
        <div className="flex items-end gap-2">
          <Field
            className="flex-1"
            label={t("item_ref")}
            value={form.autoRef && !form.ref ? nextRef() : form.ref}
            onChange={(v) => setForm({ ...form, ref: v, autoRef: false })}
          />
          <label className="flex items-center gap-2 rounded-xl border border-input px-3 py-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={form.autoRef}
              onChange={(e) => setForm({ ...form, autoRef: e.target.checked, ref: "" })}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            {t("auto_ref")}
          </label>
        </div>
        <Field label={t("item_name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <div>
          <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
            {t("item_photo")}
          </span>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-input bg-secondary">
              {form.image ? (
                <img src={form.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <label className="cursor-pointer rounded-xl bg-secondary px-3 py-2 text-xs font-black text-secondary-foreground">
              <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
              {t("upload_photo")}
            </label>
            {form.image ? (
              <Btn tone="danger" onClick={() => setForm({ ...form, image: "" })}>
                {t("remove_photo")}
              </Btn>
            ) : null}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Field
            className="flex-1"
            label={t("barcode")}
            value={form.barcode}
            onChange={(v) => setForm({ ...form, barcode: v })}
          />
          <div className="flex gap-2">
            <Btn
              tone="muted"
              onClick={async () => {
                try {
                  const code = await scanBarcodeFromCamera();
                  setForm((form) => ({ ...form, barcode: code }));
                } catch {
                  return;
                }
              }}
              disabled={!isCameraScanAvailable()}
              title={isCameraScanAvailable() ? "Scan barcode" : undefined}
            >
              <Camera className="h-4 w-4" />
            </Btn>
            <Btn
              tone="muted"
              onClick={() => setForm({ ...form, barcode: String(Date.now()).slice(-12) })}
            >
              <Barcode className="h-4 w-4" />
            </Btn>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-muted-foreground">
              {t("category")}
            </span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t("none")}</option>
              {catNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Field label={t("unit")} value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("buy_price")} inputMode="decimal" value={form.buy} onChange={(v) => setForm({ ...form, buy: v })} />
          <Field label={t("wholesale")} inputMode="decimal" value={form.wholesale} onChange={(v) => setForm({ ...form, wholesale: v })} />
          <Field label={t("sell_price")} inputMode="decimal" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("in_stock")} inputMode="decimal" value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} />
          <Field label={t("min_stock")} inputMode="decimal" value={form.minStock} onChange={(v) => setForm({ ...form, minStock: v })} />
          <Field label={t("expiry")} type="date" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
        </div>
        <div className="flex gap-2 pt-2">
          <Btn tone="success" className="flex-1 py-3" onClick={save}>
            {t("save")}
          </Btn>
          <Btn tone="muted" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
