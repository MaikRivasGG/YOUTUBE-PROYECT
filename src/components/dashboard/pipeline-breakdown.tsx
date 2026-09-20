import { Card } from "@/components/ui/misc";
import { boardStages } from "@/lib/domain/pipeline";
import type { Stage } from "@/types/database";

/** Distribucion de la carga por etapa, en barras horizontales. */
export function PipelineBreakdown({
  stages,
  byStage,
}: {
  stages: Stage[];
  byStage: Record<string, number>;
}) {
  const visible = boardStages(stages);
  const max = Math.max(1, ...visible.map((stage) => byStage[stage.id] ?? 0));

  return (
    <Card className="p-4">
      <h2 className="text-ink-900 mb-4 text-[15px] font-semibold">Carga por etapa</h2>
      <ul className="space-y-2.5">
        {visible.map((stage) => {
          const value = byStage[stage.id] ?? 0;
          return (
            <li key={stage.id} className="flex items-center gap-3">
              <span className="text-ink-600 w-24 shrink-0 truncate text-[12.5px]">
                {stage.name}
              </span>
              <span className="bg-column h-2 flex-1 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(value / max) * 100}%`, backgroundColor: stage.color }}
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
