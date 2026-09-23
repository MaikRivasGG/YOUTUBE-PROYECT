"use client";

import { CalendarDays, ChevronRight, KanbanSquare, MonitorPlay, PlayCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Card } from "@/components/ui/misc";
import { CreateVideoDialog } from "@/components/video/create-video-dialog";

const LINKS = [
  { href: "/produccion", label: "Ver pipeline", icon: KanbanSquare },
  { href: "/calendario", label: "Calendario editorial", icon: CalendarDays },
  { href: "/canales", label: "Gestionar canales", icon: MonitorPlay },
];

/** Accesos directos a lo que mas se usa desde el resumen. */
export function QuickActionsCard() {
  const { can } = useWorkspace();
  const [creating, setCreating] = React.useState(false);

  return (
    <Card className="p-4">
      <h2 className="text-ink-900 mb-2.5 text-[14px] font-semibold">Atajos rápidos</h2>

      <ul className="space-y-0.5">
        {can("video.create") ? (
          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="hover:bg-canvas -mx-1.5 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition"
            >
              <PlayCircle className="text-ink-400 size-4 shrink-0" aria-hidden />
              <span className="text-ink-700 flex-1 text-[13px] font-medium">Crear video</span>
              <ChevronRight className="text-ink-300 size-4 shrink-0" aria-hidden />
            </button>
          </li>
        ) : null}

        {LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="hover:bg-canvas -mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition"
            >
              <item.icon className="text-ink-400 size-4 shrink-0" aria-hidden />
              <span className="text-ink-700 flex-1 text-[13px] font-medium">{item.label}</span>
              <ChevronRight className="text-ink-300 size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <CreateVideoDialog open={creating} onOpenChange={setCreating} />
    </Card>
  );
}
