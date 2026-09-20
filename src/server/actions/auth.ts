"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { siteUrl } from "@/lib/env";
import {
  loginSchema,
  requestResetSchema,
  signupSchema,
  updatePasswordSchema,
} from "@/lib/domain/validators";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/utils";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/server/action-result";

type State = ActionResult<undefined> | null;

export async function signInAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return fail("Revisa los datos", zodFieldErrors(parsed.error));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return fail(errorMessage(error, "No hemos podido iniciar sesión"));

  const next = String(formData.get("next") ?? "");
  revalidatePath("/", "layout");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/resumen");
}

export async function signUpAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return fail("Revisa los datos", zodFieldErrors(parsed.error));
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) return fail(errorMessage(error, "No hemos podido crear la cuenta"));

  // Si el proyecto exige confirmación por email no hay sesión todavía.
  if (!data.session) {
    return ok(undefined);
  }

  revalidatePath("/", "layout");
  redirect("/bienvenida");
}

export async function signOutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fail("Email no valido", zodFieldErrors(parsed.error));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/nueva-password`,
  });

  if (error) return fail(errorMessage(error));
  return ok(undefined);
}

export async function updatePasswordAction(_prev: State, formData: FormData): Promise<State> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) return fail("Revisa los datos", zodFieldErrors(parsed.error));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(errorMessage(error));

  revalidatePath("/", "layout");
  redirect("/resumen");
}

export async function updateProfileAction(_prev: State, formData: FormData): Promise<State> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) return fail("Escribe tu nombre", { fullName: "Mínimo 2 caracteres" });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sesión caducada");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) return fail(errorMessage(error));

  await supabase.auth.updateUser({ data: { full_name: fullName } });
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Guarda (o quita) la foto de perfil ya subida a Storage. */
export async function updateAvatarAction(url: string | null): Promise<ActionResult<undefined>> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sesion caducada");

  if (url !== null && !/^https?:\/\//i.test(url)) {
    return fail("La imagen no es valida");
  }

  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) return fail(errorMessage(error));

  revalidatePath("/", "layout");
  return ok(undefined);
}
