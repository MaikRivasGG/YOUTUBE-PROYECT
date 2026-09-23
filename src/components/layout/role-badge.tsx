"use client";

import { Crown, ShieldCheck } from "lucide-react";

import { useWorkspace } from "@/components/providers/workspace-provider";

/**
 * Insignia del rol de quien mira: corona para el propietario, escudo para
 * administradores, y para el resto (Productor, Guionista, o cualquier rol a
 * medida) una pastilla con el nombre y el color que ya tiene configurado ese
 * rol en Ajustes -> Roles. Si el miembro lleva varios roles, se muestra el
 * mas senior (el de menor `position`).
 */
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

  const primaryRole = [...myRoles].sort((a, b) => a.position - b.position)[0];
  if (!primaryRole) return null;

  return (
    <span
      title={primaryRole.name}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${primaryRole.color}1a`, color: primaryRole.color }}
    >
      {primaryRole.name}
    </span>
  );
}
