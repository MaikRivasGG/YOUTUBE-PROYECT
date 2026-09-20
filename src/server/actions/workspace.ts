"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createWorkspaceSchema } from "@/lib/domain/validators";
import { WORKSPACE_COOKIE, requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage, slugify } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<undefined> | null;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export async function createWorkspaceAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = createWorkspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return fail("Revisa el nombre", zodFieldErrors(parsed.error));

  await requireSession();
  const supabase = await supabaseServer();

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_slug: slugify(parsed.data.name),
  });

  if (error) return fail(errorMessage(error, "No hemos podido crear el equipo"));

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, data.id, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  redirect("/produccion");
}

export async function seedDemoWorkspaceAction(): Promise<ActionResult<undefined>> {
  await requireSession();
  const supabase = await supabaseServer();

  const { data, error } = await supabase.rpc("seed_demo_workspace", {});
  if (error) return fail(errorMessage(error, "No hemos podido crear la demo"));

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, data.id, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function switchWorkspaceAction(workspaceId: string): Promise<ActionResult<undefined>> {
  const session = await requireSession();
  if (!session.workspaces.some((workspace) => workspace.id === workspaceId)) {
    return fail("No perteneces a ese equipo");
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function renameWorkspaceAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = createWorkspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return fail("Revisa el nombre", zodFieldErrors(parsed.error));

  const session = await requireSession();
  if (!session.workspace) return fail("No hay equipo activo");

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("workspaces")
    .update({ name: parsed.data.name })
    .eq("id", session.workspace.id);

  if (error) return fail(errorMessage(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}
