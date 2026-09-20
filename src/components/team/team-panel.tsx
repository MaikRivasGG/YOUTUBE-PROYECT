"use client";

import { Check, Copy, MailPlus, Trash2, UserMinus } from "lucide-react";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/misc";
import { relative } from "@/lib/dates";
import { ASSIGNABLE_ROLES, roleMeta } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
} from "@/server/actions/team";
import type { Invitation, Profile, WorkspaceRole } from "@/types/database";

export interface TeamRow {
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  profile: Profile;
}

export function TeamPanel({
  members,
  invitations,
}: {
  members: TeamRow[];
  invitations: Invitation[];
}) {
  const { can, userId, role: myRole } = useWorkspace();
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
              {members.length} personas con acceso a este equipo
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
            const meta = roleMeta(member.role);
            const isSelf = member.user_id === userId;
            const canEditRow =
              canManage && !isSelf && (member.role !== "owner" || myRole === "owner");

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

                <span className="text-ink-400 hidden text-[11.5px] sm:block">
                  {relative(member.created_at)}
                </span>

                {canEditRow ? (
                  <Select
                    aria-label={`Rol de ${member.profile.full_name}`}
                    className="h-8 w-auto min-w-36 text-[12.5px]"
                    defaultValue={member.role}
                    disabled={pending}
                    onChange={(event) => {
                      const next = event.target.value;
                      startTransition(async () => {
                        const result = await changeMemberRoleAction(member.user_id, next);
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Rol actualizado");
                      });
                    }}
                  >
                    {ASSIGNABLE_ROLES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge className={cn("ring-1", meta.chip)}>{meta.label}</Badge>
                )}

                {canEditRow ? (
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
              description="Invita a tu guionista, editor o diseñador para repartir el trabajo."
              className="m-4 border-0"
            />
          ) : (
            <ul className="divide-line divide-y">
              {invitations.map((invitation) => (
                <InvitationRow key={invitation.id} invitation={invitation} />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <RolesLegend />

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/invitacion/${invitation.token}`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink-900 truncate text-[13px] font-medium">{invitation.email}</p>
        <p className="text-ink-400 text-[11.5px]">
          {roleMeta(invitation.role).label} - caduca {relative(invitation.expires_at).toLowerCase()}
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
        aria-label="Revocar invitación"
        disabled={pending}
        className="text-ink-400 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvitationAction(invitation.id);
            if (!result.ok) toast.error(result.error);
            else toast.success("Invitación revocada");
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
  const [state, formAction, pending] = useActionState(inviteMemberAction, null);

  const inviteUrl =
    state?.ok && state.data && typeof state.data === "object" && "inviteUrl" in state.data
      ? (state.data as { inviteUrl: string }).inviteUrl
      : null;

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Invitar al equipo"
      description="Elige el rol segun la línea de trabajo que va a cubrir."
    >
      {inviteUrl ? (
        <div className="space-y-3">
          <p className="text-ink-700 text-[13px]">
            Invitación creada. Envia este enlace a la persona:
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
            <Select id="invite-role" name="role" defaultValue="writer">
              {ASSIGNABLE_ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} - {item.description}
                </option>
              ))}
            </Select>
          </Field>

          <Button type="submit" loading={pending} className="w-full justify-center">
            Crear invitación
          </Button>
        </form>
      )}
    </Dialog>
  );
}

function RolesLegend() {
  return (
    <Card className="p-4">
      <h2 className="text-ink-900 mb-3 text-[15px] font-semibold">Que puede hacer cada rol</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ASSIGNABLE_ROLES.concat(roleMeta("owner")).map((item) => (
          <li key={item.value} className="flex items-start gap-2.5">
            <Badge className={cn("mt-0.5 shrink-0 ring-1", item.chip)}>{item.label}</Badge>
            <span className="text-ink-500 text-[12.5px]">{item.description}</span>
          </li>
        ))}
      </ul>
      <p className="text-ink-400 mt-3 text-[12px]">
        Ademas de los permisos generales, cada rol puede mover las tarjetas de su etapa del pipeline
        (guion, grabación, edición, miniatura, publicación) y las que tenga asignadas.
      </p>
    </Card>
  );
}
