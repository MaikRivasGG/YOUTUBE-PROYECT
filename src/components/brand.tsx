import { cn } from "@/lib/utils";

/** Marca del producto: cuadrado naranja con el simbolo de play + wordmark. */
export function Logo({
  size = "md",
  withText = true,
  subtitle = "ESTUDIO CREATIVO",
  className,
  tone = "light",
}: {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
  subtitle?: string | null;
  className?: string;
  tone?: "light" | "dark";
}) {
  const mark = {
    sm: "size-7 rounded-lg",
    md: "size-9 rounded-xl",
    lg: "size-11 rounded-xl",
  }[size];

  const title = {
    sm: "text-[13px]",
    md: "text-sm",
    lg: "text-base",
  }[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "from-brand-500 to-brand-600 grid place-items-center bg-gradient-to-br text-white shadow-sm",
          mark,
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M10.5 9.8v4.4l4-2.2-4-2.2Z" fill="currentColor" />
        </svg>
      </span>
      {withText ? (
        <span className="leading-tight">
          <span
            className={cn(
              "block font-bold tracking-[0.08em]",
              title,
              tone === "dark" ? "text-white" : "text-ink-900",
            )}
          >
            FRAMEHOUSE
          </span>
          {subtitle ? (
            <span
              className={cn(
                "block text-[9px] font-medium tracking-[0.14em]",
                tone === "dark" ? "text-sidebar-text/70" : "text-ink-400",
              )}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
