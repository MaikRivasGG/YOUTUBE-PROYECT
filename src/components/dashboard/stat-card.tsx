import type { LucideIcon } from "lucide-react";

import { Card, Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** Color del icono, en clases Tailwind. */
  tone?: "brand" | "amber" | "violet" | "emerald" | "red";
  footnote?: string;
  footnoteTone?: "muted" | "positive" | "warning" | "danger";
  progress?: number;
}

const TONES = {
  brand: "bg-brand-50 text-brand-600 dark:text-brand-500",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
} as const;

const FOOTNOTES = {
  muted: "text-ink-400",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  footnote,
  footnoteTone = "muted",
  progress,
}: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink-500 text-[12.5px] font-medium">{label}</p>
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", TONES[tone])}>
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>

      <p className="text-ink-900 mt-2 text-[28px] leading-none font-semibold">{value}</p>

      {typeof progress === "number" ? <Progress value={progress} className="mt-3" /> : null}

      {footnote ? (
        <p className={cn("mt-2 text-[11.5px] font-medium", FOOTNOTES[footnoteTone])}>{footnote}</p>
      ) : null}
    </Card>
  );
}
