import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { ToneIcon } from "@/components/dashboard/stat-card";
import { Card } from "@/components/ui/misc";
import { dueLabel, isOverdue, time } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { VideoPriority } from "@/types/database";

export interface UpcomingItem {
  id: string;
  title: string;
  stage_id: string;
  priority: VideoPriority;
  due_date: string | null;
  publish_at: string | null;
}

export function UpcomingCard({ items }: { items: UpcomingItem[] }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <ToneIcon icon={CalendarDays} tone="amber" size="sm" />
        <h2 className="text-ink-900 text-[14px] font-semibold">Próximos vencimientos</h2>
      </div>

      {items.length === 0 ? (
        <p className="text-ink-400 py-3 text-[12.5px]">Nada vence en los próximos días.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const label = dueLabel(item.due_date);
            const late = isOverdue(item.due_date);
            const hour = time(item.publish_at);

            return (
              <li key={item.id} className="flex gap-2.5">
                <span className="w-14 shrink-0 pt-0.5">
                  <span
                    className={cn(
                      "block text-[10px] font-bold tracking-wide uppercase",
                      late ? "text-red-600" : "text-ink-400",
                    )}
                  >
                    {label}
                  </span>
                  {hour ? <span className="text-ink-400 block text-[10px]">{hour}</span> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <Link
                    href={`/videos/${item.id}`}
                    className="hover:text-brand-600 text-ink-900 block truncate text-[12.5px] font-medium"
                  >
                    {item.title}
                  </Link>
                  {late || item.priority === "urgent" ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wide text-red-600 uppercase">
                      <span className="size-1 rounded-full bg-red-600" />
                      En riesgo
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/calendario"
        className="text-brand-600 mt-4 inline-block text-[12px] font-medium hover:underline"
      >
        Ver calendario editorial
      </Link>
    </Card>
  );
}
