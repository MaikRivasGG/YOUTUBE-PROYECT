"use client";

import { Plus, Search } from "lucide-react";
import * as React from "react";

import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { CreateVideoDialog } from "@/components/video/create-video-dialog";
import { longDate, weekNumber } from "@/lib/dates";
import type { Notification } from "@/types/database";

/**
 * Cabecera comun: título contextual, buscador global, avisos y accion primaria.
 */
export function PageHeader({
  title,
  subtitle,
  notifications = [],
  children,
}: {
  title: string;
  subtitle?: string;
  notifications?: Notification[];
  children?: React.ReactNode;
}) {
  const { can } = useWorkspace();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="bg-surface border-line sticky top-0 z-30 border-b">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 lg:px-7">
          <div className="min-w-0 flex-1">
            <h1 className="text-ink-900 truncate text-[19px] font-semibold">{title}</h1>
            <p className="text-ink-500 mt-0.5 text-[12.5px]">
              {subtitle ?? `${longDate()} - ${weekNumber()}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="bg-canvas text-ink-400 hover:ring-ink-400/50 ring-line hidden h-9 w-64 items-center gap-2 rounded-full px-3.5 text-[13px] ring-1 transition md:flex"
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left">Buscar video, canal o persona...</span>
              <kbd className="bg-surface text-ink-400 border-line rounded border px-1.5 py-0.5 text-[10px] font-medium">
                CtrlK
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar"
              className="bg-canvas text-ink-500 ring-line grid size-9 place-items-center rounded-full ring-1 md:hidden"
            >
              <Search className="size-4" />
            </button>

            <NotificationsBell initial={notifications} />

            {can("video.create") ? (
              <Button onClick={() => setCreateOpen(true)} className="rounded-full">
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">Crear tarea o video</span>
                <span className="sm:hidden">Crear</span>
              </Button>
            ) : null}
          </div>
        </div>

        {children ? <div className="px-5 pb-3 lg:px-7">{children}</div> : null}
      </header>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <CreateVideoDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
