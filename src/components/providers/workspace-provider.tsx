"use client";

import * as React from "react";

import { boardStages, sortStages } from "@/lib/domain/pipeline";
import { can as canWithRoles, isOwner as isOwnerRoles, type Permission } from "@/lib/domain/roles";
import type { TeamMember } from "@/server/queries";
import type { Channel, Pipeline, Profile, Role, RoleStage, Stage } from "@/types/database";

export interface WorkspaceData {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  profile: Profile;
  channels: Channel[];
  pipelines: Pipeline[];
  stages: Stage[];
  roles: Role[];
  roleStages: RoleStage[];
  members: TeamMember[];
  myRoles: Role[];
  managedStageIds: string[];
}

export interface WorkspaceContextValue extends WorkspaceData {
  /** Permiso del usuario actual, sumando todos sus roles. */
  can: (permission: Permission) => boolean;
  isOwner: boolean;
  managedStages: ReadonlySet<string>;
  memberById: (id: string) => Profile | undefined;
  rolesOfMember: (id: string) => Role[];
  channelById: (id: string | null) => Channel | undefined;
  stageById: (id: string) => Stage | undefined;
  roleById: (id: string | null) => Role | undefined;
  /** Etapas de un pipeline, ordenadas y sin la de archivado. */
  stagesOf: (pipelineId: string) => Stage[];
  allStagesOf: (pipelineId: string) => Stage[];
  archivedStageOf: (pipelineId: string) => Stage | undefined;
  stagesOfRole: (roleId: string) => Stage[];
  defaultPipeline: Pipeline | undefined;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceData;
  children: React.ReactNode;
}) {
  const contextValue = React.useMemo<WorkspaceContextValue>(() => {
    const memberIndex = new Map(value.members.map((member) => [member.user_id, member.profile]));
    const rolesIndex = new Map(value.members.map((member) => [member.user_id, member.roles]));
    const channelIndex = new Map(value.channels.map((channel) => [channel.id, channel]));
    const stageIndex = new Map(value.stages.map((stage) => [stage.id, stage]));
    const roleIndex = new Map(value.roles.map((role) => [role.id, role]));
    const managedStages = new Set(value.managedStageIds);

    const stagesByPipeline = new Map<string, Stage[]>();
    for (const stage of value.stages) {
      const list = stagesByPipeline.get(stage.pipeline_id);
      if (list) list.push(stage);
      else stagesByPipeline.set(stage.pipeline_id, [stage]);
    }

    return {
      ...value,
      can: (permission) => canWithRoles(value.myRoles, permission),
      isOwner: isOwnerRoles(value.myRoles),
      managedStages,
      memberById: (id) => memberIndex.get(id),
      rolesOfMember: (id) => rolesIndex.get(id) ?? [],
      channelById: (id) => (id ? channelIndex.get(id) : undefined),
      stageById: (id) => stageIndex.get(id),
      roleById: (id) => (id ? roleIndex.get(id) : undefined),
      stagesOf: (pipelineId) => boardStages(stagesByPipeline.get(pipelineId) ?? []),
      allStagesOf: (pipelineId) => sortStages(stagesByPipeline.get(pipelineId) ?? []),
      archivedStageOf: (pipelineId) =>
        (stagesByPipeline.get(pipelineId) ?? []).find((stage) => stage.kind === "archived"),
      stagesOfRole: (roleId) =>
        sortStages(
          value.roleStages
            .filter((link) => link.role_id === roleId)
            .flatMap((link) => {
              const stage = stageIndex.get(link.stage_id);
              return stage ? [stage] : [];
            }),
        ),
      defaultPipeline:
        value.pipelines.find((pipeline) => pipeline.is_default) ?? value.pipelines[0],
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
