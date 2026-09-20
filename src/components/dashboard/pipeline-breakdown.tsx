import { Card } from "@/components/ui/misc";
import { PIPELINE } from "@/lib/domain/pipeline";
import { cn } from "@/lib/utils";
import type { VideoStatus } from "@/types/database";

/** Distribucion de la carga por etapa, en barras horizontales. */
export function PipelineBreakdown({
  byStatus,
}: {
  byStatus: Partial<Record<VideoStatus, number>>;
}) {
  const max = Math.max(1, ...PIPELINE.map((stage) => byStatus[stage.id] ?? 0));

  return (
    <Card className="p-4">
      <h2 className="text-ink-900 mb-4 text-[15px] font-semibold">Carga por etapa</h2>
      <ul className="space-y-2.5">
        {PIPELINE.map((stage) => {
          const value = byStatus[stage.id] ?? 0;
          return (
            <li key={stage.id} className="flex items-center gap-3">
              <span className="text-ink-600 w-24 shrink-0 text-[12.5px]">{stage.label}</span>
              <span className="bg-column h-2 flex-1 overflow-hidden rounded-full">
                <span
                  className={cn("block h-full rounded-full", stage.dot)}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </span>
              <span className="text-ink-500 w-6 shrink-0 text-right text-[12px] font-medium">
                {value}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
