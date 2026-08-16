import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  hint,
  action,
  compact,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${
        compact ? "px-4 py-8" : "px-6 py-14"
      }`}
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="text-sm font-black">{title}</p>
      {hint ? <p className="max-w-sm text-xs font-semibold text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
