import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceProvider } from "@/components/providers/workspace-provider";
import { requireWorkspace } from "@/lib/session";
import { getChannels, getTeamMembers, getWorkspaceStats } from "@/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorkspace();
  const workspaceId = session.workspace.id;

  const [channels, members, stats] = await Promise.all([
    getChannels(workspaceId),
    getTeamMembers(workspaceId),
    getWorkspaceStats(workspaceId),
  ]);

  return (
    <WorkspaceProvider
      value={{
        workspaceId,
        workspaceName: session.workspace.name,
        role: session.role,
        userId: session.userId,
        profile: session.profile,
        channels,
        members: members.map((member) => ({
          user_id: member.user_id,
          role: member.role,
          profile: member.profile,
        })),
      }}
    >
      <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
        <Sidebar
          workspaces={session.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            role: workspace.role,
          }))}
          activeWorkspaceId={workspaceId}
          summary={`${stats.members} miembros - ${stats.channels} canales`}
          channels={channels}
          profile={session.profile}
          role={session.role}
          productionCount={stats.in_progress}
        />

        <main className="bg-canvas min-w-0 flex-1 lg:overflow-hidden">{children}</main>
      </div>
    </WorkspaceProvider>
  );
}
