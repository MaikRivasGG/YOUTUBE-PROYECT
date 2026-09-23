"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";

const STORAGE_KEY = "framehouse-theme";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Almacenamiento bloqueado (privado/incognito): el cambio sigue
    // funcionando, solo no se recuerda entre sesiones.
  }
}

/**
 * Modo nocturno/diurno. El estado real vive en la clase `dark` del <html>,
 * puesta antes del primer pintado por el script anti-parpadeo de layout.tsx.
 * El estado inicial se lee de ahi (por eso el hydration warning se ignora
 * aqui a proposito: el servidor no puede saber que eligio el navegador).
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() => {
        const next = !dark;
        setDark(next);
        applyTheme(next);
      }}
      aria-label={dark ? "Cambiar a modo diurno" : "Cambiar a modo nocturno"}
      title={dark ? "Modo diurno" : "Modo nocturno"}
      className="bg-canvas text-ink-500 ring-line hover:text-ink-900 grid size-9 shrink-0 place-items-center rounded-full ring-1 transition"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
