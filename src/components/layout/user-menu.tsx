"use client";

import { LogOut, MoreHorizontal, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { roleMeta } from "@/lib/domain/roles";
import { signOutAction } from "@/server/actions/auth";
import type { Profile, WorkspaceRole } from "@/types/database";

export function UserMenu({ profile, role }: { profile: Profile; role: WorkspaceRole | null }) {
  const router = useRouter();

  return (
    <Menu
      align="start"
      className="bottom-full mb-1.5 w-56"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="hover:bg-sidebar-soft flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition"
        >
          <Avatar id={profile.id} name={profile.full_name} url={profile.avatar_url} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">
              {profile.full_name}
            </span>
            <span className="text-sidebar-text block truncate text-[11px]">
              {role ? roleMeta(role).label : "Sin equipo"}
            </span>
          </span>
          <MoreHorizontal className="text-sidebar-text size-4" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <MenuItem
            onClick={() => {
              close();
              router.push("/ajustes");
            }}
          >
            <UserRound className="size-4" aria-hidden />
            Mi perfil
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              router.push("/ajustes");
            }}
          >
            <Settings className="size-4" aria-hidden />
            Ajustes del equipo
          </MenuItem>
          <MenuSeparator />
          <form action={signOutAction}>
            <MenuItem type="submit" destructive>
              <LogOut className="size-4" aria-hidden />
              Cerrar sesión
            </MenuItem>
          </form>
        </>
      )}
    </Menu>
  );
}
