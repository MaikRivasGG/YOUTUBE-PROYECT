"use server";

import { revalidatePath } from "next/cache";

import { changeRoleSchema, inviteSchema } from "@/lib/domain/validators";
import { siteUrl } from "@/lib/env";
import { requireSession, requireWorkspace } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<{ inviteUrl: string }> | ActionResult<undefined> | null;

/**
 * Crea la invitación y devuelve el enlace listo para compartir.
 * No requiere service role: el destinatario se registra y acepta con el token.
 */
export async function inviteMemberAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
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

  // Una invitación nueva sustituye a la anterior para ese email.
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
      role: parsed.data.role,
      invited_by: userId,
    })
    .select("token")
    .single();

  if (error) return fail(errorMessage(error, "No hemos podido crear la invitación"));

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

export async function changeMemberRoleAction(
  userId: string,
  role: string,
): Promise<ActionResult<undefined>> {
  const parsed = changeRoleSchema.safeParse({ user_id: userId, role });
  if (!parsed.success) return fail("Rol no valido");

  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("workspace_members")
    .update({ role: parsed.data.role })
    .eq("workspace_id", workspace.id)
    .eq("user_id", parsed.data.user_id);

  if (error) return fail(errorMessage(error, "No tienes permiso para cambiar ese rol"));
  revalidatePath("/equipo");
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

  if (error) return fail(errorMessage(error, "No tienes permiso para quitar a esa persona"));
  revalidatePath("/equipo");
  return ok(undefined);
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<undefined>> {
  await requireSession();
  const supabase = await supabaseServer();

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return fail(errorMessage(error, "No hemos podido aceptar la invitación"));

  revalidatePath("/", "layout");
  return ok(undefined);
}
