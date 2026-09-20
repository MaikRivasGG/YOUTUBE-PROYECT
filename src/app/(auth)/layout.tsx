import { CheckCircle2 } from "lucide-react";

import { Logo } from "@/components/brand";

const HIGHLIGHTS = [
  "Pipeline visual de idea a publicación, canal por canal",
  "Roles reales del equipo: guion, voz, edición, miniatura y subida",
  "Todo en vivo: lo que mueve tu compañero aparece al instante",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <aside className="bg-sidebar relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          aria-hidden
          className="bg-brand-500/20 absolute -top-24 -left-20 size-80 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="absolute right-0 -bottom-32 size-96 rounded-full bg-violet-600/10 blur-3xl"
        />

        <Logo size="lg" tone="dark" className="relative" />

        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold text-balance text-white">
            La producción de tus canales faceless, en un solo tablero.
          </h1>
          <p className="text-sidebar-text mt-3 text-sm leading-relaxed">
            Framehouse ordena el trabajo de tu equipo con las etapas reales de un canal faceless, no
            con listas genéricas.
          </p>
          <ul className="mt-7 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="text-sidebar-text flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="text-brand-500 mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sidebar-text/60 relative text-xs">
          Hecho para equipos que publican cada semana.
        </p>
      </aside>

      {/* Formulario */}
      <main className="bg-surface flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <Logo size="md" className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
