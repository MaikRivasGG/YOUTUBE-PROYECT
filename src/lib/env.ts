import { z } from "zod";

/**
 * Variables de entorno publicas. Se leen con acceso literal a process.env
 * porque Next solo sustituye las referencias estaticas en el bundle cliente.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY"),
});

export function publicEnv() {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Configuración de Supabase incompleta. Copia .env.example a .env.local y rellena las claves.\n${parsed.error.issues
        .map((issue) => `- ${issue.message}`)
        .join("\n")}`,
    );
  }

  return parsed.data;
}

export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
