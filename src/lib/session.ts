import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { supabaseServer } from "@/lib/supabase/server";
import type { Profile, Workspace } from "@/types/database";

export const WORKSPACE_COOKIE = "fh_workspace";

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile;
  workspaces: Workspace[];
  /** Workspace activo, o null si el usuario aun no pertenece a ninguno. */
  workspace: Workspace | null;
}

/**
 * Contexto de sesion cacheado por peticion: usuario, perfil, equipos a los que
 * pertenece y equipo activo (cookie `fh_workspace`, con el primero como
 * respaldo). Los roles ya no viven aqui: los carga el layout de la aplicacion,
 * porque un miembro puede tener varios.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspaces(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const workspaces: Workspace[] = (memberships ?? [])
    .flatMap((membership) => {
      const workspace = membership.workspaces as unknown as Workspace | null;
      return workspace ? [workspace] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cookieStore = await cookies();
  const preferred = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((item) => item.id === preferred) ?? workspaces[0] ?? null;

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? "",
    profile: profile ?? {
      id: user.id,
      email: user.email ?? "",
      full_name: user.email?.split("@")[0] ?? "Usuario",
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    workspaces,
    workspace,
  };
});

/** Exige sesion; redirige a /login si no la hay. */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return context;
}

/** Exige sesion y equipo activo; redirige al onboarding si no hay equipo. */
export async function requireWorkspace(): Promise<SessionContext & { workspace: Workspace }> {
  const context = await requireSession();
  if (!context.workspace) redirect("/bienvenida");
  return { ...context, workspace: context.workspace };
}
