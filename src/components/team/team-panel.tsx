"use client";

import { Check, Copy, MailPlus, Shield, Trash2, UserMinus } from "lucide-react";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { Card, EmptyState } from "@/components/ui/misc";
import { relative } from "@/lib/dates";
import { roleSummary } from "@/lib/domain/roles";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  setMemberRolesAction,
} from "@/server/actions/team";
import type { Invitation, Role } from "@/types/database";

function RoleChip({ role }: { role: Role }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${role.color}1a`, color: role.color }}
    >
      {role.name}
    </span>
  );
}

export function TeamPanel({ invitations }: { invitations: Invitation[] }) {
  const { can, isOwner, userId, members, roles, roleById, stagesOfRole } = useWorkspace();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();

  const canManage = can("member.manage");

  return (
    <div className="space-y-5">
      <Card>
        <header className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-ink-900 text-[15px] font-semibold">Miembros</h2>
            <p className="text-ink-500 text-[12.5px]">
              Cada persona puede llevar varios roles a la vez
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus className="size-4" aria-hidden />
              Invitar
            </Button>
          ) : null}
        </header>

        <ul className="divide-line divide-y">
          {members.map((member) => {
            const isSelf = member.user_id === userId;
            const memberIsOwner = member.roles.some((role) => role.key === "owner");
            const canEditRow = canManage && (!memberIsOwner || isOwner);

            return (
              <li key={member.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar
                  id={member.profile.id}
                  name={member.profile.full_name}
                  url={member.profile.avatar_url}
                  size="lg"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-ink-900 flex items-center gap-2 text-[13.5px] font-medium">
                    {member.profile.full_name}
                    {isSelf ? (
                      <span className="text-ink-400 text-[11px] font-normal">(tu)</span>
                    ) : null}
                  </p>
                  <p className="text-ink-500 truncate text-[12px]">{member.profile.email}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {member.roles.length === 0 ? (
                    <span className="text-ink-400 text-[11.5px]">Sin rol asignado</span>
                  ) : null}
                  {member.roles.map((role) => (
                    <RoleChip key={role.id} role={role} />
                  ))}
                </div>

                <span className="text-ink-400 hidden text-[11.5px] lg:block">
                  {relative(member.created_at)}
                </span>

                {canEditRow ? (
                  <Menu
                    className="w-64"
                    trigger={({ toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        disabled={pending}
                        aria-label={`Roles de ${member.profile.full_name}`}
                        className="text-ink-500 hover:bg-canvas hover:text-ink-900 ring-line inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] ring-1 transition"
                      >
                        <Shield className="size-3.5" aria-hidden />
                        Roles
                      </button>
                    )}
                  >
                    {() => (
                      <>
                        <MenuLabel>Roles de esta persona</MenuLabel>
                        {roles.map((role) => {
                          const active = member.roles.some((item) => item.id === role.id);
                          const blocked = role.key === "owner" && !isOwner;

                          return (
                            <MenuItem
                              key={role.id}
                              disabled={blocked}
                              onClick={() => {
                                const next = active
                                  ? member.roles.filter((item) => item.id !== role.id)
                                  : [...member.roles, role];

                                startTransition(async () => {
                                  const result = await setMemberRolesAction(
                                    member.user_id,
                                    next.map((item) => item.id),
                                  );
                                  if (!result.ok) toast.error(result.error);
                                  else toast.success("Roles actualizados");
                                });
                              }}
                            >
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: role.color }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{role.name}</span>
                                <span className="text-ink-400 block truncate text-[11px]">
                                  {stagesOfRole(role.id)
                                    .map((stage) => stage.name)
                                    .join(", ") || "Sin etapas asignadas"}
                                </span>
                              </span>
                              {active ? (
                                <Check className="text-brand-600 size-4 shrink-0" aria-hidden />
                              ) : null}
                            </MenuItem>
                          );
                        })}
                      </>
                    )}
                  </Menu>
                ) : null}

                {canEditRow && !isSelf ? (
                  <button
                    type="button"
                    aria-label={`Quitar a ${member.profile.full_name}`}
                    className="text-ink-400 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      if (!window.confirm(`Quitar a ${member.profile.full_name} del equipo?`))
                        return;
                      startTransition(async () => {
                        const result = await removeMemberAction(member.user_id);
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Miembro retirado");
                      });
                    }}
                  >
                    <UserMinus className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      {canManage ? (
        <Card>
          <header className="border-line border-b px-4 py-3">
            <h2 className="text-ink-900 text-[15px] font-semibold">Invitaciones pendientes</h2>
            <p className="text-ink-500 text-[12.5px]">
              Comparte el enlace con la persona: entra, se registra y ya esta dentro.
            </p>
          </header>

          {invitations.length === 0 ? (
            <EmptyState
              title="No hay invitaciones abiertas"
              description="Invita a tu guionista, editor o disenador para repartir el trabajo."
              className="m-4 border-0"
            />
          ) : (
            <ul className="divide-line divide-y">
              {invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  roleName={roleById(invitation.role_id)?.name ?? "Rol"}
                />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-ink-900 mb-3 text-[15px] font-semibold">Que puede cada rol</h2>
        <ul className="space-y-2.5">
          {roles.map((role) => (
            <li key={role.id} className="flex items-start gap-2.5">
              <RoleChip role={role} />
              <span className="min-w-0 flex-1">
                <span className="text-ink-500 block text-[12.5px]">{roleSummary(role)}</span>
                <span className="text-ink-400 block text-[11.5px]">
                  Etapas:{" "}
                  {stagesOfRole(role.id)
                    .map((stage) => stage.name)
                    .join(", ") || "ninguna"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-400 mt-3 text-[12px]">
          Ademas de sus permisos, cada rol puede mover las tarjetas de sus etapas y recibe aviso
          cuando entra una tarjeta en ellas. Los roles se editan desde Ajustes.
        </p>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function InvitationRow({ invitation, roleName }: { invitation: Invitation; roleName: string }) {
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/invitacion/${invitation.token}`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink-900 truncate text-[13px] font-medium">{invitation.email}</p>
        <p className="text-ink-400 text-[11.5px]">
          {roleName} · caduca {relative(invitation.expires_at).toLowerCase()}
        </p>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            toast.error("Tu navegador ha bloqueado el portapapeles");
          }
        }}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copied ? "Copiado" : "Copiar enlace"}
      </Button>

      <button
        type="button"
        aria-label="Revocar invitacion"
        disabled={pending}
        className="text-ink-400 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvitationAction(invitation.id);
            if (!result.ok) toast.error(result.error);
            else toast.success("Invitacion revocada");
          })
        }
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { roles } = useWorkspace();
  const [state, formAction, pending] = useActionState(inviteMemberAction, null);

  const inviteUrl =
    state?.ok && state.data && typeof state.data === "object" && "inviteUrl" in state.data
      ? (state.data as { inviteUrl: string }).inviteUrl
      : null;

  const assignable = roles.filter((role) => role.key !== "owner");

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Invitar al equipo"
      description="Elige el rol segun la linea de trabajo que va a cubrir. Luego puedes darle mas roles."
    >
      {inviteUrl ? (
        <div className="space-y-3">
          <p className="text-ink-700 text-[13px]">
            Invitacion creada. Envia este enlace a la persona:
          </p>
          <div className="bg-canvas ring-line flex items-center gap-2 rounded-lg px-3 py-2 ring-1">
            <code className="text-ink-700 min-w-0 flex-1 truncate text-[12px]">{inviteUrl}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
            >
              <Copy className="size-3.5" aria-hidden />
              Copiar
            </Button>
          </div>
          <Button className="w-full justify-center" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </div>
      ) : (
        <form action={formAction} className="space-y-4" noValidate>
          {state && !state.ok ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
              {state.error}
            </p>
          ) : null}

          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="persona@estudio.com"
            />
          </Field>

          <Field label="Rol" htmlFor="invite-role">
            <Select id="invite-role" name="role_id" defaultValue={assignable[0]?.id}>
              {assignable.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          <Button type="submit" loading={pending} className="w-full justify-center">
            Crear invitacion
          </Button>
        </form>
      )}
    </Dialog>
  );
}
