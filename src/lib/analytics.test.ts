import { describe, expect, it } from "vitest";

import {
  averageCycleDays,
  byChannel,
  onTimeRate,
  publicationsByMonth,
  workloadByMember,
} from "@/lib/analytics";
import type { AnalyticsVideo } from "@/server/queries";
import type { StageKind } from "@/types/database";

/** Etapas de ejemplo: el id coincide con su tipo para que se lea facil. */
const kinds = new Map<string, StageKind>([
  ["idea", "backlog"],
  ["editing", "work"],
  ["published", "done"],
  ["archived", "archived"],
]);

function video(overrides: Partial<AnalyticsVideo> & { id: string }): AnalyticsVideo {
  return {
    channel_id: null,
    stage_id: "idea",
    created_at: "2025-01-01T00:00:00Z",
    published_at: null,
    due_date: null,
    video_assignees: [],
    ...overrides,
  };
}

describe("publicationsByMonth", () => {
  const now = new Date("2025-06-15T12:00:00Z");

  it("devuelve una serie continua terminada en el mes actual", () => {
    const points = publicationsByMonth([], 6, now);
    expect(points).toHaveLength(6);
    expect(points.at(-1)?.key).toBe("2025-06");
    expect(points[0].key).toBe("2025-01");
  });

  it("cuenta las publicaciones en su mes", () => {
    const points = publicationsByMonth(
      [
        video({ id: "a", published_at: "2025-06-02T10:00:00Z" }),
        video({ id: "b", published_at: "2025-06-20T10:00:00Z" }),
        video({ id: "c", published_at: "2025-04-02T10:00:00Z" }),
        video({ id: "d", published_at: "2023-01-02T10:00:00Z" }),
      ],
      6,
      now,
    );

    expect(points.at(-1)?.published).toBe(2);
    expect(points.find((point) => point.key === "2025-04")?.published).toBe(1);
  });
});

describe("averageCycleDays", () => {
  it("es null sin publicaciones", () => {
    expect(averageCycleDays([video({ id: "a" })])).toBeNull();
  });

  it("promedia los días entre creación y publicación", () => {
    const result = averageCycleDays([
      video({ id: "a", created_at: "2025-01-01T00:00:00Z", published_at: "2025-01-05T00:00:00Z" }),
      video({ id: "b", created_at: "2025-01-01T00:00:00Z", published_at: "2025-01-03T00:00:00Z" }),
    ]);
    expect(result).toBe(3);
  });
});

describe("workloadByMember", () => {
  it("solo cuenta tarjetas vivas", () => {
    const load = workloadByMember(
      [
        video({ id: "a", stage_id: "editing", video_assignees: [{ user_id: "u1" }] }),
        video({ id: "b", stage_id: "published", video_assignees: [{ user_id: "u1" }] }),
        video({
          id: "c",
          stage_id: "idea",
          video_assignees: [{ user_id: "u1" }, { user_id: "u2" }],
        }),
      ],
      kinds,
    );

    expect(load.get("u1")).toBe(2);
    expect(load.get("u2")).toBe(1);
  });
});

describe("byChannel", () => {
  it("separa activos y publicados, e ignora archivados", () => {
    const result = byChannel(
      [
        video({ id: "a", channel_id: "c1", stage_id: "editing" }),
        video({ id: "b", channel_id: "c1", stage_id: "published" }),
        video({ id: "c", channel_id: "c1", stage_id: "archived" }),
        video({ id: "d", stage_id: "idea" }),
      ],
      kinds,
    );

    expect(result.get("c1")).toEqual({ active: 1, published: 1 });
    expect(result.get("sin-canal")).toEqual({ active: 1, published: 0 });
  });
});

describe("onTimeRate", () => {
  it("es null si no hay publicados con fecha limite", () => {
    expect(
      onTimeRate([video({ id: "a", stage_id: "published", published_at: "2025-01-01T00:00:00Z" })]),
    ).toBeNull();
  });

  it("calcula el porcentaje cumplido", () => {
    const rate = onTimeRate([
      video({ id: "a", published_at: "2025-01-01T00:00:00Z", due_date: "2025-01-02" }),
      video({ id: "b", published_at: "2025-01-05T00:00:00Z", due_date: "2025-01-02" }),
    ]);
    expect(rate).toBe(50);
  });
});
