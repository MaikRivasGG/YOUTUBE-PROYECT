"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn, initials } from "@/lib/utils";
import { switchWorkspaceAction } from "@/server/actions/workspace";
import type { WorkspaceRole } from "@/types/database";

export interface SwitcherWorkspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  summary,
}: {
  workspaces: SwitcherWorkspace[];
  activeId: string;
  summary: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];

  return (
    <Menu
      align="start"
      className="w-64"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={cn(
            "bg-sidebar-soft ring-sidebar-line hover:bg-sidebar-line flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left ring-1 transition",
            pending && "opacity-60",
          )}
        >
          <span className="from-brand-500 to-brand-600 grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white">
            {initials(active?.name, "EQ")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">
              {active?.name}
            </span>
            <span className="text-sidebar-text block truncate text-[11px]">{summary}</span>
          </span>
          <ChevronsUpDown className="text-sidebar-text size-4 shrink-0" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <MenuLabel>Tus equipos</MenuLabel>
          {workspaces.map((workspace) => (
            <MenuItem
              key={workspace.id}
              onClick={() => {
                close();
                if (workspace.id === activeId) return;
                startTransition(async () => {
                  const result = await switchWorkspaceAction(workspace.id);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              <span className="bg-canvas text-ink-700 grid size-6 place-items-center rounded-md text-[10px] font-bold">
                {initials(workspace.name, "EQ")}
              </span>
              <span className="flex-1 truncate">{workspace.name}</span>
              {workspace.id === activeId ? (
                <Check className="text-brand-600 size-4" aria-hidden />
              ) : null}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              close();
              router.push("/bienvenida?nuevo=1");
            }}
          >
            <Plus className="size-4" aria-hidden />
            Crear otro equipo
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
