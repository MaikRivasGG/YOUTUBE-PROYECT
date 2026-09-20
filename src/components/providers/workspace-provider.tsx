"use client";

import * as React from "react";

import { can, type Permission } from "@/lib/domain/roles";
import type { Channel, Profile, WorkspaceRole } from "@/types/database";

export interface WorkspaceContextValue {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  userId: string;
  profile: Profile;
  channels: Channel[];
  members: { user_id: string; role: WorkspaceRole; profile: Profile }[];
  can: (permission: Permission) => boolean;
  memberById: (id: string) => Profile | undefined;
  channelById: (id: string | null) => Channel | undefined;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: Omit<WorkspaceContextValue, "can" | "memberById" | "channelById">;
  children: React.ReactNode;
}) {
  const contextValue = React.useMemo<WorkspaceContextValue>(() => {
    const memberIndex = new Map(value.members.map((member) => [member.user_id, member.profile]));
    const channelIndex = new Map(value.channels.map((channel) => [channel.id, channel]));

    return {
      ...value,
      can: (permission) => can(value.role, permission),
      memberById: (id) => memberIndex.get(id),
      channelById: (id) => (id ? channelIndex.get(id) : undefined),
    };
  }, [value]);

  return <WorkspaceContext value={contextValue}>{children}</WorkspaceContext>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = React.use(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>");
  }
  return context;
}
