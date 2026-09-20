import type { Metadata } from "next";

import { PipelinesPanel } from "@/components/admin/pipelines-panel";
import { RolesPanel } from "@/components/admin/roles-panel";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteWorkspaceForm, ProfileForm, WorkspaceForm } from "@/components/team/settings-forms";
import { requireWorkspace } from "@/lib/session";
import { getNotifications } from "@/server/queries";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace();
  const notifications = await getNotifications(workspace.id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Ajustes"
        subtitle="Tu perfil, tu equipo, los flujos de trabajo y los roles"
        notifications={notifications}
      />

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <div className="mx-auto max-w-3xl space-y-4">
          <ProfileForm />
          <WorkspaceForm />
          <PipelinesPanel />
          <RolesPanel />
          <DeleteWorkspaceForm />
        </div>
      </div>
    </div>
  );
}
