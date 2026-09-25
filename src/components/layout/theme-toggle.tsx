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
 *
 * El servidor no sabe que tema eligio el navegador, asi que el primer render
 * en el cliente tiene que ser IGUAL al del servidor (icono vacio) para no
 * disparar un aviso de hidratacion; el icono real aparece justo despues,
 * al montar, leyendo la clase que ya puso el script.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    // Señal de "ya estamos en el navegador": no hay forma de suscribirse a
    // esto, es un unico salto de servidor a cliente a proposito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        setDark(next);
        applyTheme(next);
      }}
      aria-label={dark ? "Cambiar a modo diurno" : "Cambiar a modo nocturno"}
      title={dark ? "Modo diurno" : "Modo nocturno"}
      className="bg-canvas text-ink-500 ring-line hover:text-ink-900 grid size-9 shrink-0 place-items-center rounded-full ring-1 transition"
    >
      {mounted ? (
        dark ? (
          <Sun className="size-4" aria-hidden />
        ) : (
          <Moon className="size-4" aria-hidden />
        )
      ) : (
        <span className="size-4" aria-hidden />
      )}
    </button>
  );
}
