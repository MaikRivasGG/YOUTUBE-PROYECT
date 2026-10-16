import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

// El plan gratuito de Supabase pausa el proyecto tras 7 dias sin peticiones.
// Un Cron de Vercel llama aqui una vez al dia para que eso no ocurra.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const env = publicEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Con la clave anonima RLS no devuelve filas, pero la consulta llega a Postgres.
  const { error } = await supabase.from("workspaces").select("id").limit(1);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true, at: new Date().toISOString() });
}
