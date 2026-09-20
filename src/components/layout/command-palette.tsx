"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Dialog } from "@/components/ui/dialog";
import { Dot } from "@/components/ui/badge";
import { stageMeta } from "@/lib/domain/pipeline";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { VideoStatus } from "@/types/database";

interface Hit {
  id: string;
  ref: string;
  title: string;
  status: VideoStatus;
  channel_id: string | null;
}

/** Buscador global del topbar. Se abre con la tecla rapida o con el click. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaceId, channelById } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [active, setActive] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  // Reinicia la busqueda cada vez que se abre el panel.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setQuery("");
    setHits([]);
    setActive(0);
  }

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    let cancelled = false;

    // Debounce para no lanzar una consulta por pulsacion.
    const timer = setTimeout(async () => {
      setLoading(true);
      const supabase = supabaseBrowser();
      // `or()` recibe un filtro en crudo: hay que limpiar los caracteres con
      // los que se podria reescribir la condicion (coma, parentesis, comodines).
      const safeTerm = term.replace(/[,()%*\\]/g, " ").trim();
      if (safeTerm.length < 2) {
        setHits([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("videos")
        .select("id, ref, title, status, channel_id")
        .eq("workspace_id", workspaceId)
        .or(`title.ilike.%${safeTerm}%,ref.ilike.%${safeTerm}%`)
        .limit(8);

      if (!cancelled) {
        setHits((data ?? []) as Hit[]);
        setActive(0);
        setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, workspaceId]);

  // Con menos de dos caracteres no se muestra nada aunque queden resultados
  // de la busqueda anterior.
  const results = query.trim().length < 2 ? [] : hits;

  const go = React.useCallback(
    (hit: Hit) => {
      onOpenChange(false);
      router.push(`/videos/${hit.id}`);
    },
    [onOpenChange, router],
  );

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Buscar"
      description="Busca por título o referencia (VID-0001)."
    >
      <div className="space-y-3">
        <div className="bg-canvas ring-line focus-within:ring-brand-500 flex items-center gap-2 rounded-lg px-3 ring-1 focus-within:ring-2">
          <Search className="text-ink-400 size-4" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Buscar video, canal o persona..."
            className="placeholder:text-ink-400 h-11 flex-1 bg-transparent text-sm outline-none"
            aria-label="Buscar"
          />
        </div>

        <ul className="scrollbar-slim max-h-72 overflow-y-auto">
          {loading ? <li className="text-ink-400 px-2 py-3 text-[13px]">Buscando...</li> : null}
          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <li className="text-ink-400 px-2 py-3 text-[13px]">Sin resultados</li>
          ) : null}
          {results.map((hit, index) => {
            const channel = channelById(hit.channel_id);
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(hit)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                    index === active ? "bg-canvas" : "",
                  )}
                >
                  {channel ? <Dot color={channel.color} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-900 block truncate text-[13px] font-medium">
                      {hit.title}
                    </span>
                    <span className="text-ink-400 block text-[11px]">
                      {hit.ref} - {stageMeta(hit.status).label}
                    </span>
                  </span>
                  {index === active ? (
                    <CornerDownLeft className="text-ink-400 size-3.5" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
