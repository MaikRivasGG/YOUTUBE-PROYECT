"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { addDays, addWeeks, format, isSameDay, isSameMonth, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/** Semana actual con marcas en los días que tienen publicaciones. */
export function MiniCalendar({
  publishDates,
  weekPublications,
}: {
  publishDates: string[];
  weekPublications: number;
}) {
  const [offset, setOffset] = React.useState(0);
  const today = new Date();
  const start = startOfWeek(addWeeks(today, offset), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  const marked = React.useMemo(
    () => new Set(publishDates.map((date) => date.slice(0, 10))),
    [publishDates],
  );

  const monthLabel = format(start, "LLLL", { locale: es });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-ink-900 text-[14px] font-semibold capitalize">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setOffset((value) => value - 1)}
            aria-label="Semana anterior"
            className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-md p-1 transition"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOffset((value) => value + 1)}
            aria-label="Semana siguiente"
            className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-md p-1 transition"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`} className="text-ink-400 text-[10px] font-medium">
            {day}
          </span>
        ))}

        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const key = format(day, "yyyy-MM-dd");
          return (
            <span key={key} className="flex flex-col items-center gap-1 py-1">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-[11.5px] font-medium",
                  isToday
                    ? "bg-ink-900 text-white"
                    : isSameMonth(day, today)
                      ? "text-ink-700"
                      : "text-ink-400",
                )}
              >
                {format(day, "d")}
              </span>
              <span
                className={cn(
                  "size-1 rounded-full",
                  marked.has(key) ? "bg-brand-500" : "bg-transparent",
                )}
              />
            </span>
          );
        })}
      </div>

      <p className="text-ink-500 mt-2 flex items-center gap-1.5 text-[11.5px]">
        <span className="bg-brand-500 size-1.5 rounded-full" />
        {weekPublications} publicaciones esta semana
      </p>
    </Card>
  );
}
