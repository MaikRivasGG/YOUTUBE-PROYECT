"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Sube una imagen y devuelve su URL publica.
 *
 * La carpeta es lo que gobierna el permiso: `avatars/<user_id>/...` solo la
 * escribe su dueno, y `channels/<workspace_id>/...` quien pueda gestionar los
 * canales de ese equipo. Lo valida Storage con sus propias politicas.
 */
export async function uploadImage(
  bucket: "avatars" | "channels",
  folder: string,
  file: File,
): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Formato no admitido: usa JPG, PNG, WEBP o GIF");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("La imagen pesa mas de 2 MB");
  }

  const supabase = supabaseBrowser();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
