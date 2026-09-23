import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card, Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type Tone = "brand" | "amber" | "violet" | "emerald" | "red";

export const TONES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 dark:text-brand-500",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
};

const PROGRESS_COLORS: Record<Tone, string> = {
  brand: "var(--color-brand-500)",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  emerald: "#10b981",
  red: "#ef4444",
};

const FOOTNOTES = {
  muted: "text-ink-400",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
} as const;

/** Insignia de icono redonda con el color del "tono", reutilizada en cabeceras de tarjeta. */
export function ToneIcon({
  icon: Icon,
  tone = "brand",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        size === "sm" ? "size-7" : "size-9",
        TONES[tone],
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
    </span>
  );
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  footnote?: string;
  footnoteTone?: "muted" | "positive" | "warning" | "danger";
  progress?: number;
  /** Si se da, la tarjeta entera enlaza ahi y muestra una flecha. */
  href?: string;
}

export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  footnote,
  footnoteTone = "muted",
  progress,
  href,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink-500 text-[12.5px] font-medium">{label}</p>
        <div className="flex items-center gap-1.5">
          <ToneIcon icon={icon} tone={tone} />
          {href ? <ChevronRight className="text-ink-400 size-4" aria-hidden /> : null}
        </div>
      </div>

      <p className="text-ink-900 mt-2 text-[28px] leading-none font-semibold">{value}</p>

      {typeof progress === "number" ? (
        <Progress value={progress} color={PROGRESS_COLORS[tone]} className="mt-3" />
      ) : null}

      {footnote ? (
        <p className={cn("mt-2 text-[11.5px] font-medium", FOOTNOTES[footnoteTone])}>{footnote}</p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="bg-surface card-shadow rounded-card ring-line hover:ring-ink-400/40 block p-4 ring-1 transition"
      >
        {content}
      </Link>
    );
  }

  return <Card className="p-4">{content}</Card>;
}
