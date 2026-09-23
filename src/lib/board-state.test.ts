import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  applyAssigneeEvent,
  applyChecklistEvent,
  applyFilters,
  applyRealtimeEvent,
  computeMove,
  groupByStage,
  progressOf,
} from "@/lib/board-state";
import type { BoardVideo } from "@/server/queries";

function video(overrides: Partial<BoardVideo> & { id: string }): BoardVideo {
  return {
    workspace_id: "ws",
    pipeline_id: "pipe",
    stage_id: "idea",
    channel_id: null,
    ref: "VID-0001",
    title: "Título",
    hook: null,
    description: null,
    script_body: null,
    priority: "normal",
    position: 1000,
    tags: [],
    due_date: null,
    publish_at: null,
    published_at: null,
    youtube_url: null,
    thumbnail_url: null,
    reference_url: null,
    created_by: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    video_assignees: [],
    checklist_items: [],
    ...overrides,
  };
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("groupByStage", () => {
  it("agrupa y ordena por posicion", () => {
    const groups = groupByStage([
      video({ id: "b", stage_id: "script", position: 2000 }),
      video({ id: "a", stage_id: "script", position: 1000 }),
      video({ id: "c", stage_id: "idea" }),
    ]);

    expect(groups.get("script")?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups.get("idea")?.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("computeMove", () => {
  const videos = [
    video({ id: "a", stage_id: "idea", position: 1000 }),
    video({ id: "b", stage_id: "script", position: 1000 }),
    video({ id: "c", stage_id: "script", position: 2000 }),
  ];

  it("mueve a otra columna calculando el punto medio", () => {
    const result = computeMove(videos, "a", "script", 1);
    expect(result?.position).toBe(1500);
    expect(result?.videos.find((item) => item.id === "a")?.stage_id).toBe("script");
  });

  it("mueve al final de la columna destino", () => {
    expect(computeMove(videos, "a", "script", 2)?.position).toBe(3000);
  });

  it("ignora la propia tarjeta al reordenar dentro de su columna", () => {
    expect(computeMove(videos, "b", "script", 1)?.position).toBe(3000);
  });

  it("devuelve null si la tarjeta no existe", () => {
    expect(computeMove(videos, "zzz", "script", 0)).toBeNull();
  });
});

describe("applyRealtimeEvent", () => {
  const current = [video({ id: "a", video_assignees: [{ user_id: "u1" }] })];

  it("añade tarjetas nuevas", () => {
    const next = applyRealtimeEvent(current, {
      type: "INSERT",
      video: video({ id: "b" }),
    });
    expect(next).toHaveLength(2);
  });

  it("conserva relaciones no incluidas en el evento", () => {
    const incoming = video({ id: "a", title: "Nuevo", updated_at: "2025-02-01T00:00:00Z" });
    // Postgres solo envia columnas de la tabla videos.
    delete (incoming as Partial<BoardVideo>).video_assignees;

    const next = applyRealtimeEvent(current, { type: "UPDATE", video: incoming });
    expect(next[0].title).toBe("Nuevo");
    expect(next[0].video_assignees).toEqual([{ user_id: "u1" }]);
  });

  it("descarta eventos más antiguos que el estado local", () => {
    const stale = video({ id: "a", title: "Viejo", updated_at: "2024-01-01T00:00:00Z" });
    const next = applyRealtimeEvent(
      [video({ id: "a", title: "Actual", updated_at: "2025-06-01T00:00:00Z" })],
      { type: "UPDATE", video: stale },
    );
    expect(next[0].title).toBe("Actual");
  });

  it("elimina tarjetas borradas", () => {
    expect(applyRealtimeEvent(current, { type: "DELETE", id: "a" })).toHaveLength(0);
  });
});

describe("eventos de relaciones", () => {
  it("añade y quita asignados sin duplicar", () => {
    const start = [video({ id: "a" })];
    const added = applyAssigneeEvent(start, { type: "INSERT", videoId: "a", userId: "u1" });
    const twice = applyAssigneeEvent(added, { type: "INSERT", videoId: "a", userId: "u1" });
    expect(twice[0].video_assignees).toEqual([{ user_id: "u1" }]);

    const removed = applyAssigneeEvent(twice, { type: "DELETE", videoId: "a", userId: "u1" });
    expect(removed[0].video_assignees).toEqual([]);
  });

  it("recalcula el progreso de la checklist", () => {
    let videos = [video({ id: "a" })];
    videos = applyChecklistEvent(videos, {
      type: "INSERT",
      videoId: "a",
      id: "c1",
      isDone: false,
    });
    videos = applyChecklistEvent(videos, { type: "INSERT", videoId: "a", id: "c2", isDone: true });
    expect(progressOf(videos[0])).toBe(50);

    videos = applyChecklistEvent(videos, { type: "UPDATE", videoId: "a", id: "c1", isDone: true });
    expect(progressOf(videos[0])).toBe(100);

    videos = applyChecklistEvent(videos, { type: "DELETE", videoId: "a", id: "c1", isDone: true });
    expect(videos[0].checklist_items).toHaveLength(1);
  });
});

describe("applyFilters", () => {
  const videos = [
    video({ id: "a", title: "Baterías", channel_id: "c1", due_date: isoDaysFromNow(-2) }),
    video({ id: "b", title: "Toledo", channel_id: "c2", due_date: isoDaysFromNow(3) }),
    video({ id: "c", title: "Café", channel_id: "c1", video_assignees: [{ user_id: "u1" }] }),
  ];

  it("sin filtros devuelve todo", () => {
    expect(applyFilters(videos, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("filtra por canal", () => {
    expect(applyFilters(videos, { ...EMPTY_FILTERS, channelId: "c1" })).toHaveLength(2);
  });

  it("filtra por persona asignada", () => {
    expect(applyFilters(videos, { ...EMPTY_FILTERS, assigneeId: "u1" })).toHaveLength(1);
  });

  it("filtra los vencidos", () => {
    const overdue = applyFilters(videos, { ...EMPTY_FILTERS, due: "overdue" });
    expect(overdue.map((item) => item.id)).toEqual(["a"]);
  });

  it("filtra los de esta semana", () => {
    const week = applyFilters(videos, { ...EMPTY_FILTERS, due: "week" });
    expect(week.map((item) => item.id)).toEqual(["b"]);
  });

  it("filtra los que no tienen fecha", () => {
    expect(applyFilters(videos, { ...EMPTY_FILTERS, due: "none" }).map((v) => v.id)).toEqual(["c"]);
  });

  it("busca por texto sin distinguir mayusculas", () => {
    expect(applyFilters(videos, { ...EMPTY_FILTERS, query: "tOLe" }).map((v) => v.id)).toEqual([
      "b",
    ]);
  });
});
