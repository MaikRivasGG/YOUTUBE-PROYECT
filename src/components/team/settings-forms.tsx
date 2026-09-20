"use client";

import { useActionState } from "react";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { roleMeta } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";
import { updateProfileAction } from "@/server/actions/auth";
import { renameWorkspaceAction } from "@/server/actions/workspace";

export function ProfileForm() {
  const { profile, role } = useWorkspace();
  const [state, formAction, pending] = useActionState(updateProfileAction, null);

  React.useEffect(() => {
    if (state?.ok) toast.success("Perfil actualizado");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <Card className="p-5">
      <h2 className="text-ink-900 text-[15px] font-semibold">Mi perfil</h2>
      <p className="text-ink-500 mt-0.5 text-[12.5px]">
        Así te ve el resto del equipo en las tarjetas y los comentarios.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Avatar id={profile.id} name={profile.full_name} url={profile.avatar_url} size="lg" />
        <div>
          <p className="text-ink-900 text-[13.5px] font-medium">{profile.full_name}</p>
          <p className="text-ink-500 text-[12px]">{profile.email}</p>
        </div>
        <Badge className={cn("ml-auto ring-1", roleMeta(role).chip)}>{roleMeta(role).label}</Badge>
      </div>

      <form action={formAction} className="mt-4 flex items-end gap-2">
        <Field label="Nombre" htmlFor="fullName" className="flex-1">
          <Input
            id="fullName"
            name="fullName"
            defaultValue={profile.full_name}
            required
            maxLength={80}
          />
        </Field>
        <Button type="submit" loading={pending}>
          Guardar
        </Button>
      </form>
    </Card>
  );
}

export function WorkspaceForm() {
  const { workspaceName, can } = useWorkspace();
  const [state, formAction, pending] = useActionState(renameWorkspaceAction, null);

  React.useEffect(() => {
    if (state?.ok) toast.success("Equipo actualizado");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <Card className="p-5">
      <h2 className="text-ink-900 text-[15px] font-semibold">Equipo</h2>
      <p className="text-ink-500 mt-0.5 text-[12.5px]">
        El nombre aparece en el selector superior y en las invitaciones.
      </p>

      <form action={formAction} className="mt-4 flex items-end gap-2">
        <Field label="Nombre del equipo" htmlFor="workspace-name" className="flex-1">
          <Input
            id="workspace-name"
            name="name"
            defaultValue={workspaceName}
            disabled={!can("workspace.manage")}
            required
            maxLength={60}
          />
        </Field>
        <Button type="submit" loading={pending} disabled={!can("workspace.manage")}>
          Guardar
        </Button>
      </form>

      {!can("workspace.manage") ? (
        <p className="text-ink-400 mt-2 text-[12px]">
          Solo el propietario o un administrador pueden cambiar el nombre.
        </p>
      ) : null}
    </Card>
  );
}
