import { Card, RadialProgress } from "@/components/ui/misc";

/** Anillo de productividad: de lo que se creo esta semana, cuanto ya esta hecho. */
export function ProductivityCard({ completed, total }: { completed: number; total: number }) {
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card className="flex items-center gap-4 p-4">
      <RadialProgress value={rate} color="var(--color-brand-500)" />
      <div className="min-w-0">
        <p className="text-ink-900 text-[20px] font-bold">{rate}%</p>
        <p className="text-ink-600 text-[12.5px] font-medium">Productividad del equipo</p>
        <p className="text-ink-400 text-[11.5px]">
          {total > 0 ? `${completed}/${total} tareas de esta semana` : "Sin tareas nuevas esta semana"}
        </p>
      </div>
    </Card>
  );
}
