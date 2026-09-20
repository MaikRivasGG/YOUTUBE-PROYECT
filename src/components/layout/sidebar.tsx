"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, X } from "lucide-react";
import * as React from "react";

import { Logo } from "@/components/brand";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { UserMenu } from "@/components/layout/user-menu";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "@/components/layout/workspace-switcher";
import { Dot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Channel, Profile, WorkspaceRole } from "@/types/database";

export interface SidebarProps {
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
  summary: string;
  channels: Channel[];
  profile: Profile;
  role: WorkspaceRole | null;
  productionCount: number;
}

export function Sidebar(props: SidebarProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = React.useState(pathname);

  // Cierra el panel móvil al navegar.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      {/* Barra superior solo móvil */}
      <div className="bg-sidebar flex items-center justify-between px-4 py-3 lg:hidden">
        <Logo size="sm" tone="dark" subtitle={null} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="text-sidebar-text hover:bg-sidebar-soft rounded-lg p-2"
        >
          <MenuIcon className="size-5" />
        </button>
      </div>

      {open ? (
        <div
          className="bg-ink-900/50 fixed inset-0 z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "bg-sidebar fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 pt-5 pb-4">
          <Logo size="md" tone="dark" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menu"
            className="text-sidebar-text lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-3">
          <WorkspaceSwitcher
            workspaces={props.workspaces}
            activeId={props.activeWorkspaceId}
            summary={props.summary}
          />
        </div>

        <nav className="scrollbar-slim mt-5 flex-1 overflow-y-auto px-3" aria-label="Principal">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                      active
                        ? "bg-sidebar-soft text-white"
                        : "text-sidebar-text hover:bg-sidebar-soft/60 hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn("size-4.5 shrink-0", active ? "text-brand-500" : "")}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge === "production" && props.productionCount > 0 ? (
                      <span className="bg-brand-500 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {props.productionCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="text-sidebar-text/60 mt-6 mb-2 px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
            Canales
          </p>
          <ul className="space-y-0.5 pb-4">
            {props.channels.length === 0 ? (
              <li className="text-sidebar-text/70 px-2.5 py-1.5 text-[12px]">Aún no hay canales</li>
            ) : null}
            {props.channels.map((channel) => (
              <li key={channel.id}>
                <Link
                  href={`/produccion?canal=${channel.id}`}
                  className="text-sidebar-text hover:bg-sidebar-soft/60 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition hover:text-white"
                >
                  <Dot color={channel.color} />
                  <span className="truncate">{channel.name}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/canales"
                className="text-sidebar-text/70 hover:text-brand-500 block px-2.5 py-1.5 text-[12px] transition"
              >
                Gestionar canales
              </Link>
            </li>
          </ul>
        </nav>

        <div className="border-sidebar-line border-t p-2">
          <UserMenu profile={props.profile} role={props.role} />
        </div>
      </aside>
    </>
  );
}
