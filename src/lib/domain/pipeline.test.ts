import { describe, expect, it } from "vitest";

import {
  POSITION_STEP,
  boardStages,
  needsRebalance,
  positionBetween,
  positionForIndex,
  sortStages,
  stageKindLabel,
} from "@/lib/domain/pipeline";
import type { Stage, StageKind } from "@/types/database";

function stage(slug: string, position: number, kind: StageKind = "work"): Stage {
  return {
    id: slug,
    pipeline_id: "pipe",
    name: slug,
    slug,
    color: "#000000",
    kind,
    position,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

describe("positionBetween", () => {
  it("usa el paso por defecto cuando la columna esta vacia", () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
  });

  it("coloca antes de la primera tarjeta", () => {
    expect(positionBetween(null, 1000)).toBe(0);
  });

  it("coloca despues de la ultima tarjeta", () => {
    expect(positionBetween(3000, null)).toBe(4000);
  });

  it("usa el punto medio entre dos tarjetas", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});

describe("positionForIndex", () => {
  const positions = [1000, 2000, 3000];

  it("inserta al principio, en medio y al final", () => {
    expect(positionForIndex(positions, 0)).toBe(0);
    expect(positionForIndex(positions, 1)).toBe(1500);
    expect(positionForIndex(positions, positions.length)).toBe(4000);
  });

  it("tolera indices fuera de rango", () => {
    expect(positionForIndex([], 5)).toBe(POSITION_STEP);
  });
});

describe("needsRebalance", () => {
  it("detecta perdida de precision entre posiciones contiguas", () => {
    expect(needsRebalance(1000, 1000.00001)).toBe(true);
    expect(needsRebalance(1000, 1500)).toBe(false);
  });
});

describe("etapas", () => {
  const stages = [
    stage("published", 3000, "done"),
    stage("idea", 1000, "backlog"),
    stage("archived", 4000, "archived"),
    stage("script", 2000),
  ];

  it("ordena por posicion", () => {
    expect(sortStages(stages).map((s) => s.slug)).toEqual([
      "idea",
      "script",
      "published",
      "archived",
    ]);
  });

  it("el tablero deja fuera lo archivado", () => {
    expect(boardStages(stages).map((s) => s.slug)).toEqual(["idea", "script", "published"]);
  });

  it("traduce el tipo de etapa", () => {
    expect(stageKindLabel("done")).toBe("Publicado");
    expect(stageKindLabel("review")).toBe("Revision");
  });
});
