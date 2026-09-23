import { Play } from "lucide-react";

/** Tarjeta decorativa de cierre de la fila de estadisticas: puro tono, sin dato. */
export function InspireCard() {
  return (
    <div
      className="relative flex min-h-[110px] flex-col justify-end overflow-hidden rounded-xl p-4"
      style={{
        backgroundImage:
          "linear-gradient(160deg, #2a1a3a 0%, #6b2a3a 45%, #d9622b 75%, #f5a742 100%)",
      }}
    >
      <span
        aria-hidden
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-white/20 backdrop-blur-sm"
      >
        <Play className="ml-0.5 size-3.5 fill-white text-white" />
      </span>
      <p className="text-[13.5px] leading-tight font-semibold text-white">
        Grandes historias,
        <br />
        hechas con IA.
      </p>
    </div>
  );
}
