"use server";

import { revalidatePath } from "next/cache";

import { roleSchema } from "@/lib/domain/validators";
import { requireWorkspace } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<undefined> | null;

function readRole(formData: FormData) {
  const flag = (name: string) => formData.get(name) === "on" || formData.get(name) === "true";

  return {
    name: formData.get("name"),
    color: formData.get("color") ?? "#64748b",
    manage_workspace: flag("manage_workspace"),
    manage_members: flag("manage_members"),
    manage_channels: flag("manage_channels"),
    manage_pipelines: flag("manage_pipelines"),
    create_videos: flag("create_videos"),
    delete_videos: flag("delete_videos"),
    edit_videos: flag("edit_videos"),
    assign_videos: flag("assign_videos"),
    move_any_stage: flag("move_any_stage"),
    write_comments: flag("write_comments"),
    stage_ids: formData.getAll("stage_ids").map(String),
  };
}

function revalidateAll() {
  revalidatePath("/", "layout");
  revalidatePath("/equipo");
  revalidatePath("/ajustes");
}

/** Sustituye las etapas que gestiona un rol por la lista recibida. */
async function syncRoleStages(roleId: string, stageIds: string[]) {
  const supabase = await supabaseServer();

  await supabase.from("role_stages").delete().eq("role_id", roleId);

  if (stageIds.length === 0) return null;

  const { error } = await supabase
    .from("role_stages")
    .insert(stageIds.map((stageId) => ({ role_id: roleId, stage_id: stageId })));

  return error;
}

export async function createRoleAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = roleSchema.safeParse(readRole(formData));
  if (!parsed.success) return fail("Revisa los datos del rol", zodFieldErrors(parsed.error));

  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { stage_ids: stageIds, ...fields } = parsed.data;

  const { data: last } = await supabase
    .from("roles")
    .select("position")
    .eq("workspace_id", workspace.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: role, error } = await supabase
    .from("roles")
    .insert({ workspace_id: workspace.id, ...fields, position: (last?.position ?? 0) + 1000 })
    .select("id")
    .single();

  if (error) return fail(errorMessage(error, "No hemos podido crear el rol"));

  const stagesError = await syncRoleStages(role.id, stageIds);
  if (stagesError) return fail(errorMessage(stagesError));

  revalidateAll();
  return ok(undefined);
}

export async function updateRoleAction(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("id") ?? "");
  const parsed = roleSchema.safeParse(readRole(formData));
  if (!id) return fail("Rol no valido");
  if (!parsed.success) return fail("Revisa los datos del rol", zodFieldErrors(parsed.error));

  await requireWorkspace();
  const supabase = await supabaseServer();

  const { stage_ids: stageIds, ...fields } = parsed.data;

  const { error } = await supabase.from("roles").update(fields).eq("id", id);
  if (error) {
    return fail(errorMessage(error, "Los roles de sistema no se pueden editar"));
  }

  const stagesError = await syncRoleStages(id, stageIds);
  if (stagesError) return fail(errorMessage(stagesError));

  revalidateAll();
  return ok(undefined);
}

export async function deleteRoleAction(id: string): Promise<ActionResult<undefined>> {
  await requireWorkspace();
  const supabase = await supabaseServer();

  const { count } = await supabase
    .from("member_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role_id", id);

  if ((count ?? 0) > 0) {
    return fail("Ese rol esta asignado a alguien: quitaselo antes de eliminarlo");
  }

  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return fail(errorMessage(error, "Los roles de sistema no se pueden eliminar"));

  revalidateAll();
  return ok(undefined);
}
