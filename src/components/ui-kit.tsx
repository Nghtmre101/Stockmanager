import { cn } from "@/lib/utils";

export function Field({
  label,
  value,
  onChange,
  inputMode,
  type,
  placeholder,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "decimal" | "tel";
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="mb-1 block text-[11px] font-bold text-muted-foreground">{label}</span>
      ) : null}
      <input
        value={value}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-input px-3 py-2 text-sm font-bold"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-success" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all",
            checked ? "left-[22px] " : "left-0.5 ",
          )}
        />
      </span>
    </button>
  );
}

export function Btn({
  children,
  onClick,
  tone = "primary",
  className,
  disabled,
  type,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "primary" | "success" | "warning" | "danger" | "muted" | "accent";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const tones = {
    primary: "bg-primary text-primary-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    danger: "bg-destructive text-destructive-foreground",
    muted: "bg-secondary text-secondary-foreground",
    accent: "bg-accent text-accent-foreground",
  } as const;
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition active:scale-95 disabled:opacity-40 disabled:active:scale-100",
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Th({ cols }: { cols: string[] }) {
  return (
    <thead className="brand-gradient text-primary-foreground">
      <tr>
        {cols.map((c, i) => (
          <th key={`${c}-${i}`} className="px-3 py-2.5 text-left text-xs font-black">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function StatCard({
  label,
  value,
  tone = "card",
  icon,
}: {
  label: string;
  value: string;
  tone?: "card" | "primary" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  const tones = {
    card: "surface-card",
    primary: "brand-gradient text-primary-foreground glow-shadow",
    success: "bg-success text-success-foreground glow-shadow",
    warning: "bg-warning text-warning-foreground glow-shadow",
    danger: "bg-destructive text-destructive-foreground glow-shadow",
  } as const;
  return (
    <div className={cn("rounded-2xl p-4", tones[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("truncate text-xs font-bold", tone === "card" ? "text-muted-foreground" : "opacity-85")}>
          {label}
        </p>
        {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      </div>
      <p className="mt-2 truncate text-lg font-black lg:text-xl">{value}</p>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-3xl sm:pb-5"
      >
        <h2 className="mb-4 text-base font-black">{title}</h2>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
