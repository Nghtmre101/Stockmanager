import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { Btn, Field, Modal, StatCard, Th } from "@/components/ui-kit";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Stock Manager" },
      {
        name: "description",
        content:
          "Create and manage the item categories used across your catalogue, point of sale and reports.",
      },
      { property: "og:title", content: "Categories — Stock Manager" },
      { property: "og:description", content: "Organise your catalogue with colour-coded categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Categories,
});

const blank = { id: "", name: "", color: "#6366f1", note: "" };

function Categories() {
  const { t } = useApp();
  const { db, upsertCategory, removeCategory } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    db.products.forEach((p) => {
      if (p.category) map[p.category] = (map[p.category] ?? 0) + 1;
    });
    return map;
  }, [db.products]);

  const save = () => {
    if (!form.name.trim()) return;
    upsertCategory({
      id: form.id || undefined,
      name: form.name.trim(),
      color: form.color,
      note: form.note.trim(),
    });
    setForm(blank);
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("categories")}
          value={String(db.categories.length)}
          tone="primary"
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard label={t("items")} value={String(db.products.length)} tone="success" />
        <StatCard
          label={t("no_results")}
          value={String(db.products.filter((p) => !p.category).length)}
        />
      </div>

      <div className="flex justify-end">
        <Btn
          tone="success"
          onClick={() => {
            setForm(blank);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> {t("add_category")}
        </Btn>
      </div>

      <div className="overflow-x-auto surface-card">
        {db.categories.length === 0 ? (
          <EmptyState title={t("empty_categories")} hint={t("empty_categories_hint")} />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <Th cols={[t("color"), t("name"), t("items"), t("note"), t("actions")]} />
            <tbody>
              {db.categories.map((c, i) => (
                <tr key={c.id} className={i % 2 ? "bg-secondary/40" : undefined}>
                  <td className="px-3 py-2">
                    <span
                      className="inline-block h-5 w-5 rounded-full border border-border"
                      style={{ background: c.color }}
                    />
                  </td>
                  <td className="px-3 py-2 font-bold">{c.name}</td>
                  <td className="px-3 py-2 font-mono">{counts[c.name] ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.note || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setForm({ id: c.id, name: c.name, color: c.color, note: c.note });
                          setOpen(true);
                        }}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => window.confirm(t("delete_confirm")) && removeCategory(c.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? t("edit") : t("add_category")}
      >
        <Field label={t("name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted-foreground">{t("color")}</span>
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-10 w-full rounded-xl border border-input bg-background px-1"
          />
        </label>
        <Field label={t("note")} value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
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
