import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm, WorkspaceForm } from "@/components/team/settings-forms";
import { Card } from "@/components/ui/misc";
import { PIPELINE } from "@/lib/domain/pipeline";
import { roleMeta, STAGE_ROLE } from "@/lib/domain/roles";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  await requireWorkspace();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Ajustes" subtitle="Tu perfil, tu equipo y como funciona el pipeline" />

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <div className="mx-auto max-w-3xl space-y-4">
          <ProfileForm />
          <WorkspaceForm />

          <Card className="p-5">
            <h2 className="text-ink-900 text-[15px] font-semibold">Responsables por etapa</h2>
            <p className="text-ink-500 mt-0.5 text-[12.5px]">
              Quién puede mover una tarjeta sin ser productor: el rol responsable de la etapa de
              origen o de destino, y cualquiera que este asignado a la tarjeta.
            </p>

            <ul className="divide-line mt-4 divide-y">
              {PIPELINE.map((stage) => (
                <li key={stage.id} className="flex items-center gap-3 py-2.5">
                  <span className={`size-2 rounded-full ${stage.dot}`} aria-hidden />
                  <span className="text-ink-900 w-28 shrink-0 text-[13px] font-medium">
                    {stage.label}
                  </span>
                  <span className="text-ink-500 flex-1 text-[12.5px]">{stage.description}</span>
                  <span className="text-ink-700 text-[12.5px] font-medium">
                    {roleMeta(STAGE_ROLE[stage.id]).label}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
