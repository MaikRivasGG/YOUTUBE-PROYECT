"use client";

import { Check, Lock, Minus } from "lucide-react";
import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Card } from "@/components/ui/misc";
import { PERMISSION_FIELDS } from "@/lib/domain/roles";
import { togglePermissionAction } from "@/server/actions/roles";
import type { Role } from "@/types/database";

/**
 * Matriz de roles x permisos.
 *
 * El editor de un rol suelto sirve para configurarlo a fondo; esta tabla sirve
 * para lo otro: ver de un vistazo quien puede que, y corregirlo sin abrir nada.
 * Solo la ve quien puede configurar el equipo.
 */
export function PermissionsMatrix() {
  const { roles, can } = useWorkspace();
  const [pending, startTransition] = useTransition();
  // Casillas cambiadas en esta pantalla, para que el cambio se vea al instante
  // mientras el servidor confirma.
  const [draft, setDraft] = React.useState<Record<string, boolean>>({});

  if (!can("workspace.manage")) return null;

  function toggle(role: Role, flag: (typeof PERMISSION_FIELDS)[number]["flag"], next: boolean) {
    const key = `${role.id}:${flag}`;
    setDraft((current) => ({ ...current, [key]: next }));

    startTransition(async () => {
      const result = await togglePermissionAction(role.id, flag, next);
      if (!result.ok) {
        // El servidor lo rechaza: se retira el cambio y vuelve a verse el valor
        // real del rol.
        setDraft((current) => {
          const rest = { ...current };
          delete rest[key];
          return rest;
        });
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className="p-5">
      <div>
        <h2 className="text-ink-900 text-[15px] font-semibold">Matriz de permisos</h2>
        <p className="text-ink-500 mt-0.5 text-[12.5px]">
          Quien puede hacer que, de un vistazo. Pulsa una casilla para cambiarla. Propietario y
          Administrador son roles del sistema y no se tocan.
        </p>
      </div>

      <div className="-mx-5 mt-4 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="text-ink-500 border-line border-b pb-2 text-left text-[11.5px] font-medium">
                Permiso
              </th>
              {roles.map((role) => (
                <th key={role.id} className="border-line border-b px-1 pb-2 align-bottom">
                  <span
                    className="mx-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                    style={{ backgroundColor: `${role.color}1a`, color: role.color }}
                  >
                    {role.is_system ? <Lock className="size-2.5" aria-hidden /> : null}
                    {role.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {PERMISSION_FIELDS.map((permission) => (
              <tr key={permission.flag} className="border-line/60 border-b last:border-0">
                <th scope="row" className="py-2 pr-3 text-left align-top">
                  <span className="text-ink-900 block text-[12.5px] font-medium">
                    {permission.label}
                  </span>
                  <span className="text-ink-400 block text-[11px] leading-snug">
                    {permission.description}
                  </span>
                </th>

                {roles.map((role) => {
                  const key = `${role.id}:${permission.flag}`;
                  const value = draft[key] ?? role[permission.flag];
                  const locked = role.is_system;

                  return (
                    <td key={role.id} className="px-1 py-2 text-center">
                      <button
                        type="button"
                        disabled={locked || pending}
                        aria-pressed={value}
                        aria-label={`${permission.label} para ${role.name}`}
                        onClick={() => toggle(role, permission.flag, !value)}
                        className={[
                          "mx-auto flex size-7 items-center justify-center rounded-lg transition",
                          locked
                            ? "cursor-not-allowed"
                            : "hover:ring-line cursor-pointer hover:ring-1",
                          value ? "bg-emerald-50 text-emerald-600" : "bg-canvas text-ink-300",
                        ].join(" ")}
                      >
                        {value ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : (
                          <Minus className="size-3.5" aria-hidden />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-400 mt-3 text-[11.5px]">
        Una persona puede llevar varios roles: si cualquiera de ellos concede un permiso, lo tiene.
      </p>
    </Card>
  );
}
