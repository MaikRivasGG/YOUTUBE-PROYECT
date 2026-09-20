"use server";

import { revalidatePath } from "next/cache";

import { channelSchema } from "@/lib/domain/validators";
import { requireWorkspace } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<undefined> | null;

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    handle: formData.get("handle") ?? "",
    niche: formData.get("niche") ?? "",
    color: formData.get("color") ?? "#ef4444",
    image_url: formData.get("image_url") ?? "",
    youtube_url: formData.get("youtube_url") ?? "",
    pipeline_id: formData.get("pipeline_id") || null,
    target_per_week: formData.get("target_per_week") ?? 3,
  };
}

export async function createChannelAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = channelSchema.safeParse(readForm(formData));
  if (!parsed.success) return fail("Revisa los datos del canal", zodFieldErrors(parsed.error));

  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { error } = await supabase.from("channels").insert({
    workspace_id: workspace.id,
    ...parsed.data,
  });

  if (error) return fail(errorMessage(error, "No hemos podido crear el canal"));

  revalidatePath("/canales");
  revalidatePath("/produccion");
  return ok(undefined);
}

export async function updateChannelAction(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("id") ?? "");
  const parsed = channelSchema.safeParse(readForm(formData));
  if (!id) return fail("Canal no valido");
  if (!parsed.success) return fail("Revisa los datos del canal", zodFieldErrors(parsed.error));

  await requireWorkspace();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("channels").update(parsed.data).eq("id", id);

  if (error) return fail(errorMessage(error));
  revalidatePath("/canales");
  revalidatePath("/produccion");
  return ok(undefined);
}

export async function setChannelArchivedAction(
  id: string,
  archived: boolean,
): Promise<ActionResult<undefined>> {
  await requireWorkspace();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("channels").update({ is_archived: archived }).eq("id", id);

  if (error) return fail(errorMessage(error));
  revalidatePath("/canales");
  revalidatePath("/produccion");
  return ok(undefined);
}
