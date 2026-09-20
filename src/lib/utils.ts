import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciales para los avatares (máximo dos letras). */
export function initials(name: string | null | undefined, fallback = "?"): string {
  const clean = (name ?? "").trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || fallback;
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-600",
  "bg-fuchsia-500",
  "bg-indigo-500",
];

/** Color estable por usuario, para que el avatar no cambie entre renders. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Convierte un error desconocido en un mensaje legible en espanol. */
export function errorMessage(error: unknown, fallback = "Algo ha salido mal"): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    return translateError(message) ?? message;
  }
  return fallback;
}

const ERROR_DICTIONARY: Record<string, string> = {
  "Invalid login credentials": "Email o contraseña incorrectos",
  "Email not confirmed": "Confirma tu email antes de entrar",
  "User already registered": "Ese email ya tiene cuenta",
  FORBIDDEN_STAGE_MOVE: "Tu rol no puede mover esta tarjeta a esa etapa",
  INVITATION_NOT_FOUND: "La invitación no existe o ya fue usada",
  INVITATION_EXPIRED: "La invitación ha caducado",
  INVITATION_EMAIL_MISMATCH: "Esta invitación es para otro email",
  AUTH_REQUIRED: "Necesitas iniciar sesión",
};

function translateError(message: string): string | null {
  // Este error viaja con la lista de lo que falta, asi que no se traduce a un
  // texto fijo: se le devuelve al equipo tal cual, que es lo util.
  const missing = message.match(/STAGE_REQUIREMENTS_MISSING:\s*(.+)/);
  if (missing) return `Antes de avanzar falta: ${missing[1].trim()}`;

  for (const [key, value] of Object.entries(ERROR_DICTIONARY)) {
    if (message.includes(key)) return value;
  }
  return null;
}

/**
 * Solo se aceptan enlaces http(s).
 *
 * Los campos de URL los rellena el equipo y luego se pintan como <a href>: sin
 * este filtro, un "javascript:..." guardado por un miembro se ejecutaria en el
 * navegador de sus companeros. La base de datos aplica la misma regla con un
 * CHECK, esto es la primera barrera.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
