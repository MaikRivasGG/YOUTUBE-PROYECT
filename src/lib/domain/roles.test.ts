import { describe, expect, it } from "vitest";

import { can, canMoveVideo } from "@/lib/domain/roles";

describe("can", () => {
  it("da control total al propietario", () => {
    expect(can("owner", "workspace.delete")).toBe(true);
    expect(can("owner", "member.manage")).toBe(true);
  });

  it("impide al admin borrar el equipo", () => {
    expect(can("admin", "workspace.delete")).toBe(false);
  });

  it("deja al guionista crear videos pero no gestionar canales", () => {
    expect(can("writer", "video.create")).toBe(true);
    expect(can("writer", "channel.manage")).toBe(false);
  });

  it("el observador es de solo lectura", () => {
    expect(can("viewer", "video.edit")).toBe(false);
    expect(can("viewer", "comment.write")).toBe(false);
  });

  it("sin rol no hay permisos", () => {
    expect(can(null, "video.edit")).toBe(false);
  });
});

describe("canMoveVideo", () => {
  const base = {
    userId: "u1",
    assigneeIds: [] as string[],
    from: "script",
    to: "voiceover",
  } as const;

  it("el productor mueve cualquier tarjeta", () => {
    expect(canMoveVideo({ ...base, role: "producer" })).toBe(true);
  });

  it("el responsable de la etapa de origen puede mover", () => {
    expect(canMoveVideo({ ...base, role: "writer" })).toBe(true);
  });

  it("el responsable de la etapa de destino puede mover", () => {
    expect(canMoveVideo({ ...base, role: "voice" })).toBe(true);
  });

  it("un rol ajeno a ambas etapas no puede mover", () => {
    expect(canMoveVideo({ ...base, role: "designer" })).toBe(false);
  });

  it("estar asignado habilita el movimiento", () => {
    expect(canMoveVideo({ ...base, role: "designer", assigneeIds: ["u1"] })).toBe(true);
  });

  it("el observador nunca mueve", () => {
    expect(canMoveVideo({ ...base, role: "viewer", assigneeIds: ["u1"] })).toBe(false);
  });
});
