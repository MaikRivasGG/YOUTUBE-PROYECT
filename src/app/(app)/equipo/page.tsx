import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TeamPanel } from "@/components/team/team-panel";
import { requireWorkspace } from "@/lib/session";
import { getNotifications, getPendingInvitations } from "@/server/queries";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const { workspace } = await requireWorkspace();

  const [invitations, notifications] = await Promise.all([
    getPendingInvitations(workspace.id),
    getNotifications(workspace.id),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Equipo"
        subtitle={`Roles y accesos de ${workspace.name}`}
        notifications={notifications}
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <TeamPanel invitations={invitations} />
      </div>
    </div>
  );
}
