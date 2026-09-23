"use client";

import { Crown, ShieldCheck } from "lucide-react";

import { useWorkspace } from "@/components/providers/workspace-provider";

/** Insignia del rol de quien mira: corona para el propietario, escudo para administradores. */
export function RoleBadge() {
  const { isOwner, myRoles } = useWorkspace();

  if (isOwner) {
    return (
      <span
        title="Propietario del equipo"
        aria-label="Propietario del equipo"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-500"
      >
        <Crown className="size-3.5" aria-hidden />
      </span>
    );
  }

  if (myRoles.some((role) => role.key === "admin")) {
    return (
      <span
        title="Administrador del equipo"
        aria-label="Administrador del equipo"
        className="bg-brand-50 text-brand-600 dark:text-brand-500 grid size-6 shrink-0 place-items-center rounded-full"
      >
        <ShieldCheck className="size-3.5" aria-hidden />
      </span>
    );
  }

  return null;
}
