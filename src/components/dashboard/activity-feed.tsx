"use client";

import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/misc";
import { relative } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ActivityEntry } from "@/server/queries";

/** Convierte una entrada de actividad en una frase legible. */
export function describeActivity(entry: {
  type: string;
  payload: Record<string, unknown>;
}): string {
  const payload = entry.payload ?? {};
  const title = typeof payload.title === "string" ? payload.title : "un video";

  switch (entry.type) {
    case "video.created":
      return `creó "${title}"`;
    case "video.moved":
      return `movió "${title}" a ${String(payload.to ?? "otra etapa")}`;
    case "video.renamed":
      return `renombró "${String(payload.from ?? "")}" a "${String(payload.to ?? "")}"`;
    case "comment.created":
      return `comentó: ${String(payload.excerpt ?? "")}`;
    case "member.joined":
      return "se unió al equipo";
    case "workspace.created":
      return `creó el equipo ${String(payload.name ?? "")}`;
    default:
      return entry.type;
  }
}

export function ActivityFeed({
  initial,
  limit = 6,
  title = "Actividad del equipo",
}: {
  initial: ActivityEntry[];
  limit?: number;
  title?: string;
}) {
  const { workspaceId, memberById } = useWorkspace();
  const [entries, setEntries] = React.useState(initial);
  const [seed, setSeed] = React.useState(initial);

  // Adopta los datos nuevos del servidor sin provocar un render extra.
  if (seed !== initial) {
    setSeed(initial);
    setEntries(initial);
  }

  React.useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`activity:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.new as ActivityEntry;
          const actor = row.actor_id ? memberById(row.actor_id) : undefined;
          setEntries((current) =>
            [
              {
                ...row,
                actor: actor
                  ? { id: actor.id, full_name: actor.full_name, avatar_url: actor.avatar_url }
                  : null,
              },
              ...current,
            ].slice(0, limit * 2),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, memberById, limit]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-ink-900 text-[14px] font-semibold">{title}</h2>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-emerald-600 uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          En vivo
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-ink-400 py-3 text-[12.5px]">Todavía no hay movimiento por aquí.</p>
      ) : (
        <ul className="space-y-3">
          {entries.slice(0, limit).map((entry) => (
            <li key={entry.id} className="flex gap-2.5">
              <Avatar
                id={entry.actor?.id ?? "sistema"}
                name={entry.actor?.full_name ?? "Sistema"}
                url={entry.actor?.avatar_url}
                size="sm"
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink-700 block text-[12.5px] leading-snug">
                  <strong className="text-ink-900 font-semibold">
                    {entry.actor?.full_name?.split(" ")[0] ?? "Alguien"}
                  </strong>{" "}
                  {describeActivity(entry)}
                </span>
                <span className="text-ink-400 text-[11px]">{relative(entry.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
