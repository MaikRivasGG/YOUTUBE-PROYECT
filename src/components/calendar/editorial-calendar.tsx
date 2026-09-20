"use client";

import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { useRealtimeBoard } from "@/hooks/use-realtime-board";
import { stageMeta } from "@/lib/domain/pipeline";
import { cn } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";

const WEEKDAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

/** Fecha que ordena el calendario: publicación programada o, si no, el limite. */
function calendarDate(video: BoardVideo): string | null {
  return video.publish_at ?? video.due_date ?? null;
}

export function EditorialCalendar({ initialVideos }: { initialVideos: BoardVideo[] }) {
  const { workspaceId, channelById } = useWorkspace();
  const { videos } = useRealtimeBoard(workspaceId, initialVideos);
  const [cursor, setCursor] = React.useState(() => startOfMonth(new Date()));

  const byDay = React.useMemo(() => {
    const map = new Map<string, BoardVideo[]>();
    for (const video of videos) {
      const raw = calendarDate(video);
      if (!raw) continue;
      const key = raw.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(video);
      else map.set(key, [video]);
    }
    return map;
  }, [videos]);

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const monthEnd = endOfMonth(cursor);
  const weeks = Math.ceil((monthEnd.getDate() + ((startOfMonth(cursor).getDay() + 6) % 7)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, index) => addDays(gridStart, index));
  const today = new Date();

  const monthTotal = videos.filter((video) => {
    const raw = calendarDate(video);
    return raw ? isSameMonth(new Date(raw), cursor) : false;
  }).length;

  return (
    <Card className="overflow-hidden">
      <header className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 className="text-ink-900 text-[15px] font-semibold capitalize">
          {format(cursor, "LLLL yyyy", { locale: es })}
        </h2>
        <span className="text-ink-400 text-[12px]">{monthTotal} publicaciones</span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Hoy
          </Button>
          <button
            type="button"
            onClick={() => setCursor((value) => addMonths(value, -1))}
            aria-label="Mes anterior"
            className="text-ink-500 hover:bg-canvas rounded-lg p-1.5 transition"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor((value) => addMonths(value, 1))}
            aria-label="Mes siguiente"
            className="text-ink-500 hover:bg-canvas rounded-lg p-1.5 transition"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>

      <div className="border-line grid grid-cols-7 border-b">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="text-ink-400 px-2 py-2 text-[11px] font-semibold tracking-wide uppercase"
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const outside = !isSameMonth(day, cursor);

          return (
            <div
              key={key}
              className={cn(
                "border-line min-h-28 border-r border-b p-1.5 last:border-r-0",
                outside && "bg-canvas/60",
              )}
            >
              <span
                className={cn(
                  "mb-1 grid size-6 place-items-center rounded-full text-[11.5px] font-medium",
                  isSameDay(day, today)
                    ? "bg-ink-900 text-white"
                    : outside
                      ? "text-ink-400"
                      : "text-ink-700",
                )}
              >
                {format(day, "d")}
              </span>

              <ul className="space-y-1">
                {items.slice(0, 3).map((video) => {
                  const channel = channelById(video.channel_id);
                  return (
                    <li key={video.id}>
                      <Link
                        href={`/videos/${video.id}`}
                        title={`${video.title} - ${stageMeta(video.status).label}`}
                        className="hover:bg-canvas flex items-center gap-1 rounded px-1 py-0.5 transition"
                      >
                        <Dot color={channel?.color ?? "#cbd5e1"} className="size-1.5" />
                        <span className="text-ink-700 truncate text-[11px]">{video.title}</span>
                      </Link>
                    </li>
                  );
                })}
                {items.length > 3 ? (
                  <li className="text-ink-400 px-1 text-[10.5px]">+{items.length - 3} más</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
