import { describe, expect, it } from "vitest";

import { can, canMoveVideo, isOwner, roleSummary } from "@/lib/domain/roles";
import type { Role } from "@/types/database";

function role(overrides: Partial<Role> & { name: string }): Role {
  return {
    id: overrides.name.toLowerCase(),
    workspace_id: "ws",
    color: "#000000",
    key: null,
    is_system: false,
    position: 1000,
    manage_workspace: false,
    manage_members: false,
    manage_channels: false,
    manage_pipelines: false,
    create_videos: false,
    delete_videos: false,
    edit_videos: true,
    assign_videos: false,
    move_any_stage: false,
    write_comments: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const owner = role({
  name: "Propietario",
  key: "owner",
  is_system: true,
  manage_workspace: true,
  manage_members: true,
  move_any_stage: true,
});
const admin = role({
  name: "Administrador",
  key: "admin",
  is_system: true,
  manage_workspace: true,
  manage_members: true,
  move_any_stage: true,
});
const writer = role({ name: "Guionista", create_videos: true });
const designer = role({ name: "Disenador" });
const viewer = role({ name: "Observador", edit_videos: false, write_comments: false });

describe("can", () => {
  it("suma los permisos de todos los roles del miembro", () => {
    expect(can([designer], "video.create")).toBe(false);
    expect(can([designer, writer], "video.create")).toBe(true);
  });

  it("solo el propietario elimina el equipo", () => {
    expect(can([owner], "workspace.delete")).toBe(true);
    expect(can([admin], "workspace.delete")).toBe(false);
  });

  it("el observador es de solo lectura", () => {
    expect(can([viewer], "video.edit")).toBe(false);
    expect(can([viewer], "comment.write")).toBe(false);
  });

  it("sin roles no hay permisos", () => {
    expect(can([], "video.edit")).toBe(false);
  });
});

describe("isOwner", () => {
  it("distingue al propietario del administrador", () => {
    expect(isOwner([owner])).toBe(true);
    expect(isOwner([admin, writer])).toBe(false);
  });
});

describe("canMoveVideo", () => {
  const base = {
    userId: "u1",
    assigneeIds: [] as string[],
    fromStageId: "script",
    toStageId: "voiceover",
  };

  it("quien puede mover cualquier etapa, mueve", () => {
    expect(canMoveVideo({ ...base, roles: [admin], managedStageIds: new Set() })).toBe(true);
  });

  it("el responsable de la etapa de origen puede mover", () => {
    expect(canMoveVideo({ ...base, roles: [writer], managedStageIds: new Set(["script"]) })).toBe(
      true,
    );
  });

  it("el responsable de la etapa de destino puede mover", () => {
    expect(
      canMoveVideo({ ...base, roles: [writer], managedStageIds: new Set(["voiceover"]) }),
    ).toBe(true);
  });

  it("un rol ajeno a ambas etapas no puede", () => {
    expect(
      canMoveVideo({ ...base, roles: [designer], managedStageIds: new Set(["thumbnail"]) }),
    ).toBe(false);
  });

  it("con varios roles basta con que uno gestione la etapa", () => {
    expect(
      canMoveVideo({
        ...base,
        roles: [designer, writer],
        managedStageIds: new Set(["thumbnail", "script"]),
      }),
    ).toBe(true);
  });

  it("estar asignado habilita el movimiento", () => {
    expect(
      canMoveVideo({
        ...base,
        roles: [designer],
        managedStageIds: new Set(),
        assigneeIds: ["u1"],
      }),
    ).toBe(true);
  });

  it("el observador nunca mueve, ni estando asignado", () => {
    expect(
      canMoveVideo({
        ...base,
        roles: [viewer],
        managedStageIds: new Set(["script"]),
        assigneeIds: ["u1"],
      }),
    ).toBe(false);
  });
});

describe("roleSummary", () => {
  it("describe los roles de sistema y los propios", () => {
    expect(roleSummary(owner)).toContain("Control total");
    expect(roleSummary(viewer)).toBe("Solo lectura");
    expect(roleSummary(writer)).toContain("Crear videos");
  });
});
