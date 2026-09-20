"use client";

import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { PERMISSION_FIELDS, roleSummary } from "@/lib/domain/roles";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/server/actions/roles";
import type { Role } from "@/types/database";

const ROLE_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#f97316",
  "#3b82f6",
  "#8b5cf6",
  "#d946ef",
  "#22c55e",
  "#64748b",
];

export function RolesPanel() {
  const { roles, can, stagesOfRole, members } = useWorkspace();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [pending, startTransition] = useTransition();

  if (!can("workspace.manage")) return null;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink-900 text-[15px] font-semibold">Roles</h2>
          <p className="text-ink-500 mt-0.5 text-[12.5px]">
            Cambia el nombre, los permisos y que etapas gestiona cada rol. Las etapas deciden quien
            mueve cada tarjeta y a quien se avisa.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" aria-hidden />
          Nuevo rol
        </Button>
      </div>

      <ul className="divide-line mt-4 divide-y">
        {roles.map((role) => {
          const stages = stagesOfRole(role.id);
          const inUse = members.filter((member) =>
            member.roles.some((item) => item.id === role.id),
          ).length;

          return (
            <li key={role.id} className="flex flex-wrap items-start gap-3 py-3">
              <span
                className="mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
                style={{ backgroundColor: `${role.color}1a`, color: role.color }}
              >
                {role.is_system ? <Lock className="size-3" aria-hidden /> : null}
                {role.name}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink-600 text-[12.5px]">{roleSummary(role)}</p>
                <p className="text-ink-400 text-[11.5px]">
                  Etapas: {stages.map((stage) => stage.name).join(", ") || "ninguna"} ·{" "}
                  {inUse === 0 ? "sin asignar" : `${inUse} persona${inUse === 1 ? "" : "s"}`}
                </p>
              </div>

              {role.is_system ? (
                <span className="text-ink-400 text-[11.5px]">Rol del sistema</span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(role)}
                    aria-label={`Editar ${role.name}`}
                    className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-lg p-1.5 transition"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Eliminar ${role.name}`}
                    className="text-ink-400 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      if (!window.confirm(`Eliminar el rol ${role.name}?`)) return;
                      startTransition(async () => {
                        const result = await deleteRoleAction(role.id);
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Rol eliminado");
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <RoleDialog open={creating} onOpenChange={setCreating} />
      <RoleDialog
        key={editing?.id ?? "edit-role"}
        open={Boolean(editing)}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        role={editing}
      />
    </Card>
  );
}

function RoleDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
}) {
  const { pipelines, allStagesOf, stagesOfRole } = useWorkspace();
  const action = role ? updateRoleAction : createRoleAction;
  const [state, formAction, pending] = useActionState(action, null);
  const [color, setColor] = React.useState(role?.color ?? ROLE_COLORS[3]);

  const assigned = new Set(role ? stagesOfRole(role.id).map((stage) => stage.id) : []);

  React.useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={role ? `Editar ${role.name}` : "Nuevo rol"}
      description="Define que puede hacer y de que etapas se encarga."
      size="lg"
    >
      <form action={formAction} className="space-y-5" noValidate>
        {role ? <input type="hidden" name="id" value={role.id} /> : null}
        <input type="hidden" name="color" value={color} />

        {state && !state.ok ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Nombre del rol" htmlFor="role-name">
            <Input
              id="role-name"
              name="name"
              defaultValue={role?.name}
              required
              placeholder="Miniaturista"
              maxLength={40}
            />
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-2 pt-1">
              {ROLE_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-label={`Color ${value}`}
                  aria-pressed={color === value}
                  className="size-7 rounded-full transition"
                  style={{
                    backgroundColor: value,
                    boxShadow: color === value ? `0 0 0 2px #fff, 0 0 0 4px ${value}` : undefined,
                  }}
                />
              ))}
            </div>
          </Field>
        </div>

        <fieldset>
          <legend className="text-ink-700 mb-2 text-[13px] font-medium">Permisos</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PERMISSION_FIELDS.map((permission) => (
              <label
                key={permission.flag}
                className="hover:bg-canvas flex cursor-pointer items-start gap-2 rounded-lg p-1.5 transition"
              >
                <input
                  type="checkbox"
                  name={permission.flag}
                  defaultChecked={
                    role
                      ? role[permission.flag]
                      : permission.flag === "edit_videos" || permission.flag === "write_comments"
                  }
                  className="accent-brand-500 mt-0.5 size-4 rounded"
                />
                <span className="min-w-0">
                  <span className="text-ink-900 block text-[12.5px] font-medium">
                    {permission.label}
                  </span>
                  <span className="text-ink-400 block text-[11.5px]">{permission.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-ink-700 mb-1 text-[13px] font-medium">Etapas que gestiona</legend>
          <p className="text-ink-400 mb-2 text-[11.5px]">
            Puede mover las tarjetas que entran o salen de estas etapas, y recibe un aviso cuando
            llega trabajo a ellas.
          </p>

          <div className="space-y-3">
            {pipelines.map((pipeline) => (
              <div key={pipeline.id}>
                <p className="text-ink-500 mb-1 text-[11.5px] font-semibold">{pipeline.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {allStagesOf(pipeline.id)
                    .filter((stage) => stage.kind !== "archived")
                    .map((stage) => (
                      <label
                        key={stage.id}
                        className="ring-line hover:bg-canvas inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1 transition has-checked:ring-2"
                        style={{ color: stage.color }}
                      >
                        <input
                          type="checkbox"
                          name="stage_ids"
                          value={stage.id}
                          defaultChecked={assigned.has(stage.id)}
                          className="accent-brand-500 size-3.5 rounded"
                        />
                        {stage.name}
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {role ? "Guardar rol" : "Crear rol"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
