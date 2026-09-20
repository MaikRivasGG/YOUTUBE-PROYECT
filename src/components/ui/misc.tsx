import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface card-shadow rounded-card ring-line ring-1", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-ink-900 text-[15px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function Progress({
  value,
  className,
  color,
}: {
  value: number;
  className?: string;
  color?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("bg-line h-1 w-full overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${safe}%`, backgroundColor: color ?? "var(--color-brand-500)" }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border-line flex flex-col items-center justify-center gap-2 border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-400">{icon}</div> : null}
      <p className="text-ink-900 text-sm font-medium">{title}</p>
      {description ? <p className="text-ink-500 max-w-sm text-[13px]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-line/70 animate-pulse rounded-lg", className)} />;
}
