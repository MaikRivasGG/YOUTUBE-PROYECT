import { Dot } from "@/components/ui/badge";
import type { Channel } from "@/types/database";

/**
 * "En que canal y en que pipeline estoy parado", siempre a la vista.
 *
 * El selector de pipeline y el filtro de canal viven en la barra de abajo,
 * pero son dos conceptos distintos que se confunden facil: el pipeline es el
 * flujo de trabajo, el canal es de quien son los videos. Esta linea los
 * nombra los dos explicitamente para que no haga falta leer un desplegable
 * para saber que se esta viendo.
 */
export function BoardScope({
  pipelineName,
  channel,
}: {
  pipelineName: string | null;
  channel: Channel | null;
}) {
  return (
    <div className="text-ink-500 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="text-ink-400">Canal</span>
      {channel ? (
        <span className="text-ink-900 inline-flex items-center gap-1.5 font-medium">
          <Dot color={channel.color} />
          {channel.name}
        </span>
      ) : (
        <span className="text-ink-700 font-medium">Todos los canales</span>
      )}

      <span className="text-ink-300 mx-0.5">·</span>

      <span className="text-ink-400">Pipeline</span>
      <span className="text-ink-900 font-medium">{pipelineName ?? "Sin pipeline"}</span>
    </div>
  );
}
