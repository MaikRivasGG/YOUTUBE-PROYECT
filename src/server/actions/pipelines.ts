"use server";

import { revalidatePath } from "next/cache";

import { pipelineSchema, stageSchema } from "@/lib/domain/validators";
import { requireWorkspace } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage, slugify } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<undefined> | null;

function revalidateAll() {
  revalidatePath("/", "layout");
  revalidatePath("/produccion");
  revalidatePath("/ajustes");
}

export async function createPipelineAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = pipelineSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return fail("Revisa los datos", zodFieldErrors(parsed.error));

  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { data: last } = await supabase
    .from("pipelines")
    .select("position")
    .eq("workspace_id", workspace.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pipeline, error } = await supabase
    .from("pipelines")
    .insert({
      workspace_id: workspace.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      position: (last?.position ?? 0) + 1000,
    })
    .select("id")
    .single();

  if (error) return fail(errorMessage(error, "No hemos podido crear el pipeline"));

  // Un flujo vacio no sirve de nada: arranca con tres etapas basicas.
  const { error: stagesError } = await supabase.from("stages").insert([
    {
      pipeline_id: pipeline.id,
      slug: "ideas",
      name: "Ideas",
      color: "#94a3b8",
      kind: "backlog",
      position: 1000,
    },
    {
      pipeline_id: pipeline.id,
      slug: "en-curso",
      name: "En curso",
      color: "#3b82f6",
      kind: "work",
      position: 2000,
    },
    {
      pipeline_id: pipeline.id,
      slug: "publicado",
      name: "Publicado",
      color: "#0d9488",
      kind: "done",
      position: 3000,
    },
    {
      pipeline_id: pipeline.id,
      slug: "archivado",
      name: "Archivado",
      color: "#cbd5e1",
      kind: "archived",
      position: 4000,
    },
  ]);

  if (stagesError) return fail(errorMessage(stagesError));

  revalidateAll();
  return ok(undefined);
}

export async function updatePipelineAction(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("id") ?? "");
  const parsed = pipelineSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!id) return fail("Pipeline no valido");
  if (!parsed.success) return fail("Revisa los datos", zodFieldErrors(parsed.error));

  await requireWorkspace();
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("pipelines")
    .update({ name: parsed.data.name, description: parsed.data.description ?? null })
    .eq("id", id);

  if (error) return fail(errorMessage(error));
  revalidateAll();
  return ok(undefined);
}

export async function deletePipelineAction(id: string): Promise<ActionResult<undefined>> {
  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const { count } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_id", id);

  if ((count ?? 0) > 0) {
    return fail("Ese pipeline todavia tiene videos: muevelos antes de eliminarlo");
  }

  const { count: total } = await supabase
    .from("pipelines")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id);

  if ((total ?? 0) <= 1) return fail("Un equipo necesita al menos un pipeline");

  const { error } = await supabase.from("pipelines").delete().eq("id", id);
  if (error) return fail(errorMessage(error));

  revalidateAll();
  return ok(undefined);
}

export async function createStageAction(_prev: State, formData: FormData): Promise<State> {
  const pipelineId = String(formData.get("pipeline_id") ?? "");
  const parsed = stageSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") ?? "#94a3b8",
    kind: formData.get("kind") ?? "work",
  });
  if (!pipelineId) return fail("Pipeline no valido");
  if (!parsed.success) return fail("Revisa los datos", zodFieldErrors(parsed.error));

  await requireWorkspace();
  const supabase = await supabaseServer();

  const { data: last } = await supabase
    .from("stages")
    .select("position")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = slugify(parsed.data.name) || "etapa";
  const { error } = await supabase.from("stages").insert({
    pipeline_id: pipelineId,
    name: parsed.data.name,
    slug: `${base}-${Math.random().toString(36).slice(2, 6)}`,
    color: parsed.data.color,
    kind: parsed.data.kind,
    position: (last?.position ?? 0) + 1000,
  });

  if (error) return fail(errorMessage(error, "No hemos podido crear la etapa"));
  revalidateAll();
  return ok(undefined);
}

export async function updateStageAction(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("id") ?? "");
  const parsed = stageSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") ?? "#94a3b8",
    kind: formData.get("kind") ?? "work",
  });
  if (!id) return fail("Etapa no valida");
  if (!parsed.success) return fail("Revisa los datos", zodFieldErrors(parsed.error));

  await requireWorkspace();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("stages").update(parsed.data).eq("id", id);

  if (error) return fail(errorMessage(error));
  revalidateAll();
  return ok(undefined);
}

/** Reordena una etapa intercambiando su posicion con la vecina. */
export async function moveStageAction(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult<undefined>> {
  await requireWorkspace();
  const supabase = await supabaseServer();

  const { data: stage } = await supabase
    .from("stages")
    .select("id, pipeline_id, position")
    .eq("id", id)
    .maybeSingle();

  if (!stage) return fail("Etapa no encontrada");

  const { data: neighbour } = await supabase
    .from("stages")
    .select("id, position")
    .eq("pipeline_id", stage.pipeline_id)
    .order("position", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("position", stage.position)
    .limit(1)
    .maybeSingle();

  if (!neighbour) return ok(undefined);

  const [a, b] = await Promise.all([
    supabase.from("stages").update({ position: neighbour.position }).eq("id", stage.id),
    supabase.from("stages").update({ position: stage.position }).eq("id", neighbour.id),
  ]);

  if (a.error || b.error) return fail(errorMessage(a.error ?? b.error));
  revalidateAll();
  return ok(undefined);
}

export async function deleteStageAction(id: string): Promise<ActionResult<undefined>> {
  await requireWorkspace();
  const supabase = await supabaseServer();

  const { count } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);

  if ((count ?? 0) > 0) {
    return fail("Esa etapa tiene tarjetas dentro: vaciala antes de eliminarla");
  }

  const { error } = await supabase.from("stages").delete().eq("id", id);
  if (error) return fail(errorMessage(error));

  revalidateAll();
  return ok(undefined);
}
