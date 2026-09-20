"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Badge, Dot } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/misc";
import { dueLabel, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";

export function MyWork({ videos }: { videos: BoardVideo[] }) {
  const { channelById, stageById } = useWorkspace();

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-ink-900 text-[15px] font-semibold">Mi trabajo</h2>
        <Link
          href="/produccion"
          className="text-ink-500 hover:text-brand-600 inline-flex items-center gap-1 text-[12px]"
        >
          Ver pipeline
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>

      {videos.length === 0 ? (
        <EmptyState
          title="No tienes tarjetas asignadas"
          description="Cuando alguien te asigne un guion, una locucion o un montaje aparecera aquí."
          className="border-0 py-6"
        />
      ) : (
        <ul className="divide-line divide-y">
          {videos.map((video) => {
            const channel = channelById(video.channel_id);
            const stage = stageById(video.stage_id);
            const due = dueLabel(video.due_date);
            const late = isOverdue(video.due_date);

            return (
              <li key={video.id}>
                <Link
                  href={`/videos/${video.id}`}
                  className="hover:bg-canvas -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition"
                >
                  {channel ? <Dot color={channel.color} /> : <Dot color="#cbd5e1" />}
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-900 block truncate text-[13px] font-medium">
                      {video.title}
                    </span>
                    <span className="text-ink-400 text-[11.5px]">
                      {video.ref} - {channel?.name ?? "Sin canal"}
                    </span>
                  </span>

                  {stage ? (
                    <Badge
                      className="bg-column text-ink-600 hidden sm:inline-flex"
                      dotColor={stage.color}
                    >
                      {stage.name}
                    </Badge>
                  ) : null}

                  {due ? (
                    <span
                      className={cn(
                        "w-16 shrink-0 text-right text-[11.5px] font-medium",
                        late ? "text-red-600" : "text-ink-500",
                      )}
                    >
                      {due}
                    </span>
                  ) : (
                    <span className="w-16 shrink-0" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
