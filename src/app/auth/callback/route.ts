import { NextResponse, type NextRequest } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";

/**
 * Intercambia el codigo de Supabase (confirmación de email, recuperación de
 * contraseña o OAuth) por una sesión en cookies y redirige a la app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/resumen";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=enlace-no-valido`);
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace-caducado`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
