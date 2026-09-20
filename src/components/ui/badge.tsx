import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  dot,
  dotColor,
}: {
  children: React.ReactNode;
  className?: string;
  /** Clase de color para el punto (paleta de Tailwind). */
  dot?: string;
  /** Color libre para el punto, cuando viene de la base de datos. */
  dotColor?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {dot || dotColor ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", dot)}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
        />
      ) : null}
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
