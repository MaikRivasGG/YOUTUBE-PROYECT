"use server";

import { revalidatePath } from "next/cache";

import { inviteSchema, memberRolesSchema } from "@/lib/domain/validators";
import { siteUrl } from "@/lib/env";
import { requireSession, requireWorkspace } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<{ inviteUrl: string }> | ActionResult<undefined> | null;

/**
 * Crea la invitacion y devuelve el enlace listo para compartir.
 * No requiere service role: el destinatario se registra y acepta con el token.
 */
export async function inviteMemberAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role_id: formData.get("role_id"),
  });
  if (!parsed.success) return fail("Revisa los datos", zodFieldErrors(parsed.error));

  const { workspace, userId } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { data: existing } = await supabase
    .from("workspace_members")
    .select("user_id, profiles!inner(email)")
    .eq("workspace_id", workspace.id);

  const alreadyMember = (existing ?? []).some((member) => {
    const profile = member.profiles as unknown as { email: string } | null;
    return profile?.email.toLowerCase() === parsed.data.email;
  });

  if (alreadyMember) return fail("Esa persona ya esta en el equipo");

  // Una invitacion nueva sustituye a la anterior para ese email.
  await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("workspace_id", workspace.id)
    .eq("email", parsed.data.email)
    .eq("status", "pending");

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      workspace_id: workspace.id,
      email: parsed.data.email,
      role_id: parsed.data.role_id,
      invited_by: userId,
    })
    .select("token")
    .single();

  if (error) return fail(errorMessage(error, "No hemos podido crear la invitacion"));

  revalidatePath("/equipo");
  return ok({ inviteUrl: `${siteUrl()}/invitacion/${data.token}` });
}

export async function revokeInvitationAction(id: string): Promise<ActionResult<undefined>> {
  await requireWorkspace();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
  if (error) return fail(errorMessage(error));
  revalidatePath("/equipo");
  return ok(undefined);
}

/**
 * Sustituye los roles de un miembro por la lista recibida.
 *
 * Se resuelve como diferencia (altas y bajas) en vez de borrar y reinsertar,
 * para que el trigger que protege al ultimo propietario siga teniendo sentido.
 */
export async function setMemberRolesAction(
  userId: string,
  roleIds: string[],
): Promise<ActionResult<undefined>> {
  const parsed = memberRolesSchema.safeParse({ user_id: userId, role_ids: roleIds });
  if (!parsed.success) return fail("Roles no validos");

  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { data: current } = await supabase
    .from("member_roles")
    .select("role_id")
    .eq("workspace_id", workspace.id)
    .eq("user_id", parsed.data.user_id);

  const currentIds = new Set((current ?? []).map((row) => row.role_id));
  const nextIds = new Set(parsed.data.role_ids);

  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("member_roles").insert(
      toAdd.map((roleId) => ({
        workspace_id: workspace.id,
        user_id: parsed.data.user_id,
        role_id: roleId,
      })),
    );
    if (error) return fail(errorMessage(error, "No tienes permiso para asignar ese rol"));
  }

  for (const roleId of toRemove) {
    const { error } = await supabase
      .from("member_roles")
      .delete()
      .eq("workspace_id", workspace.id)
      .eq("user_id", parsed.data.user_id)
      .eq("role_id", roleId);

    if (error) {
      return fail(
        error.message.includes("LAST_OWNER")
          ? "El equipo no puede quedarse sin propietario"
          : errorMessage(error),
      );
    }
  }

  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function removeMemberAction(userId: string): Promise<ActionResult<undefined>> {
  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId);

  if (error) {
    return fail(
      error.message.includes("LAST_OWNER")
        ? "El equipo no puede quedarse sin propietario"
        : errorMessage(error, "No tienes permiso para quitar a esa persona"),
    );
  }

  revalidatePath("/equipo");
  return ok(undefined);
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<undefined>> {
  await requireSession();
  const supabase = await supabaseServer();

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return fail(errorMessage(error, "No hemos podido aceptar la invitacion"));

  revalidatePath("/", "layout");
  return ok(undefined);
}
