import { Card } from "@/components/ui/misc";

const QUOTES = [
  "La constancia convierte las ideas en resultados.",
  "Un canal no crece por suerte: crece por repetición.",
  "La mejor miniatura no sirve de nada sin un buen guion detrás.",
  "Publicar poco y bien gana a publicar mucho y a medias.",
  "Cada video que sale a tiempo es una promesa cumplida al equipo.",
];

function quoteOfTheDay(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return QUOTES[dayOfYear % QUOTES.length];
}

/** Frase motivadora, distinta cada dia pero igual para todo el equipo. */
export function QuoteCard() {
  const quote = quoteOfTheDay();

  return (
    <Card className="p-4">
      <p className="text-brand-500/40 font-serif text-3xl leading-none">&ldquo;</p>
      <p className="text-ink-800 -mt-2 text-[13.5px] leading-snug font-medium italic">{quote}</p>
      <p className="text-ink-400 mt-2.5 text-[11.5px]">— Framehouse</p>
    </Card>
  );
}
