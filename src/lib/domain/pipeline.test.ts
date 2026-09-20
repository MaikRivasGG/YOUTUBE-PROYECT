import { describe, expect, it } from "vitest";

import {
  POSITION_STEP,
  needsRebalance,
  positionBetween,
  positionForIndex,
  stageMeta,
} from "@/lib/domain/pipeline";

describe("positionBetween", () => {
  it("usa el paso por defecto cuando la columna esta vacia", () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
  });

  it("coloca antes de la primera tarjeta", () => {
    expect(positionBetween(null, 1000)).toBe(0);
  });

  it("coloca despues de la última tarjeta", () => {
    expect(positionBetween(3000, null)).toBe(4000);
  });

  it("usa el punto medio entre dos tarjetas", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});

describe("positionForIndex", () => {
  const positions = [1000, 2000, 3000];

  it("inserta al principio", () => {
    expect(positionForIndex(positions, 0)).toBe(0);
  });

  it("inserta en medio", () => {
    expect(positionForIndex(positions, 1)).toBe(1500);
  });

  it("inserta al final", () => {
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

describe("stageMeta", () => {
  it("devuelve la etapa archivada para estados fuera del tablero", () => {
    expect(stageMeta("archived").label).toBe("Archivado");
  });

  it("traduce las etapas del pipeline", () => {
    expect(stageMeta("voiceover").label).toBe("Grabación");
    expect(stageMeta("thumbnail").label).toBe("Miniatura");
  });
});
