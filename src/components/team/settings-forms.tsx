"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Card } from "@/components/ui/misc";
import { updateAvatarAction, updateProfileAction } from "@/server/actions/auth";
import { deleteWorkspaceAction, renameWorkspaceAction } from "@/server/actions/workspace";

export function ProfileForm() {
  const { profile, myRoles, userId } = useWorkspace();
  const [state, formAction, pending] = useActionState(updateProfileAction, null);
  const router = useRouter();

  React.useEffect(() => {
    if (state?.ok) toast.success("Perfil actualizado");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <Card className="p-5">
      <h2 className="text-ink-900 text-[15px] font-semibold">Mi perfil</h2>
      <p className="text-ink-500 mt-0.5 text-[12.5px]">
        Asi te ve el resto del equipo en las tarjetas y los comentarios.
      </p>

      <div className="mt-4">
        <ImageUpload
          bucket="avatars"
          folder={userId}
          value={profile.avatar_url}
          label="Subir foto"
          fallback={profile.full_name}
          onChange={async (url) => {
            const result = await updateAvatarAction(url);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(url ? "Foto actualizada" : "Foto eliminada");
            router.refresh();
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {myRoles.map((role) => (
          <span
            key={role.id}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${role.color}1a`, color: role.color }}
          >
            {role.name}
          </span>
        ))}
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

/** Zona de peligro: solo el propietario y escribiendo el nombre del equipo. */
export function DeleteWorkspaceForm() {
  const { workspaceName, isOwner } = useWorkspace();
  const [state, formAction, pending] = useActionState(deleteWorkspaceAction, null);
  const [confirmation, setConfirmation] = React.useState("");

  if (!isOwner) return null;

  return (
    <Card className="border border-red-200 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-red-700">
        <AlertTriangle className="size-4" aria-hidden />
        Eliminar el equipo
      </h2>
      <p className="text-ink-500 mt-1 text-[12.5px]">
        Se borra <strong className="text-ink-700">{workspaceName}</strong> con sus canales, videos,
        comentarios e historial. No hay vuelta atras.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        {state && !state.ok ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}

        <Field label={`Escribe "${workspaceName}" para confirmar`} htmlFor="confirmation">
          <Input
            id="confirmation"
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
          />
        </Field>

        <Button
          type="submit"
          variant="danger"
          loading={pending}
          disabled={confirmation.trim() !== workspaceName}
        >
          Eliminar este equipo para siempre
        </Button>
      </form>
    </Card>
  );
}
