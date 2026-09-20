"use server";

import { revalidatePath } from "next/cache";

import { templateItemSchema } from "@/lib/domain/validators";
import { requireWorkspace } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<undefined> | null;

function revalidateAll() {
  revalidatePath("/canales");
  revalidatePath("/produccion");
}

function optionalId(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length === 0 ? null : text;
}

/** Anade un paso a la plantilla de produccion de un canal. */
export async function addTemplateItemAction(_prev: State, formData: FormData): Promise<State> {
  const channelId = String(formData.get("channel_id") ?? "");
  const parsed = templateItemSchema.safeParse({
    title: formData.get("title"),
    stage_id: optionalId(formData.get("stage_id")),
    role_id: optionalId(formData.get("role_id")),
  });

  if (!channelId) return fail("Canal no valido");
  if (!parsed.success) return fail("Revisa el paso", zodFieldErrors(parsed.error));

  await requireWorkspace();
  const supabase = await supabaseServer();

  const { data: last } = await supabase
    .from("channel_template_items")
    .select("position")
    .eq("channel_id", channelId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("channel_template_items").insert({
    channel_id: channelId,
    title: parsed.data.title,
    stage_id: parsed.data.stage_id,
    role_id: parsed.data.role_id,
    position: (last?.position ?? 0) + 1000,
  });

  if (error) return fail(errorMessage(error, "No hemos podido guardar el paso"));

  revalidateAll();
  return ok(undefined);
}

export async function deleteTemplateItemAction(id: string): Promise<ActionResult<undefined>> {
  await requireWorkspace();
  const supabase = await supabaseServer();

  const { error } = await supabase.from("channel_template_items").delete().eq("id", id);
  if (error) return fail(errorMessage(error, "No hemos podido borrar el paso"));

  revalidateAll();
  return ok(undefined);
}

/**
 * Copia el checklist de una tarjeta a la plantilla del canal.
 *
 * Es mas comodo describir el proceso trabajando sobre un video real que
 * rellenando un formulario en frio: se monta el checklist una vez, se guarda,
 * y todas las tarjetas siguientes del canal nacen con el.
 */
export async function saveTemplateFromVideoAction(
  videoId: string,
): Promise<ActionResult<{ steps: number }>> {
  await requireWorkspace();
  const supabase = await supabaseServer();

  const { data, error } = await supabase.rpc("save_template_from_video", { p_video: videoId });

  if (error) {
    if (error.message.includes("VIDEO_WITHOUT_CHANNEL")) {
      return fail("Esta tarjeta no tiene canal, asi que no hay plantilla donde guardarla");
    }
    return fail(errorMessage(error, "No hemos podido guardar la plantilla"));
  }

  revalidateAll();
  return ok({ steps: data ?? 0 });
}
