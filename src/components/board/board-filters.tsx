"use client";

import { ListFilter, X } from "lucide-react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Select } from "@/components/ui/field";
import type { BoardFilters } from "@/lib/board-state";
import { GENERAL_VIEW_PIPELINE_ID } from "@/lib/domain/pipeline";
import { cn } from "@/lib/utils";

export function BoardFiltersBar({
  filters,
  onChange,
  total,
  visible,
  connection,
  pipelineId,
  onPipelineChange,
}: {
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  total: number;
  visible: number;
  connection: "connecting" | "live" | "offline";
  pipelineId: string;
  onPipelineChange: (pipelineId: string) => void;
}) {
  const { channels, members, pipelines, can } = useWorkspace();
  const filtered = visible !== total;
  const canViewAll = can("channel.view_all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pipelines.length > 1 || canViewAll ? (
        <Select
          aria-label="Pipeline"
          className="h-8 w-auto min-w-36 text-[13px] font-semibold"
          value={pipelineId}
          onChange={(event) => onPipelineChange(event.target.value)}
        >
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </option>
          ))}
          {canViewAll ? (
            <option value={GENERAL_VIEW_PIPELINE_ID}>Vista general (todos los canales)</option>
          ) : null}
        </Select>
      ) : (
        <h2 className="text-ink-900 text-[15px] font-semibold">
          {pipelines[0]?.name ?? "Pipeline"}
        </h2>
      )}
      <span className="bg-column text-ink-500 rounded-full px-2 py-0.5 text-[11px] font-medium">
        {filtered ? `${visible} de ${total}` : `${total} tareas`}
      </span>

      <span
        className={cn(
          "ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
          connection === "live"
            ? "bg-emerald-50 text-emerald-700"
            : connection === "offline"
              ? "bg-red-50 text-red-600"
              : "bg-amber-50 text-amber-700",
        )}
        title="Estado de la sincronización en tiempo real"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            connection === "live"
              ? "animate-pulse bg-emerald-500"
              : connection === "offline"
                ? "bg-red-500"
                : "bg-amber-500",
          )}
        />
        {connection === "live"
          ? "EN VIVO"
          : connection === "offline"
            ? "SIN CONEXIÓN"
            : "CONECTANDO"}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filtrar por canal"
          className="h-8 w-auto min-w-36 text-[12.5px]"
          value={filters.channelId ?? ""}
          onChange={(event) => onChange({ ...filters, channelId: event.target.value || null })}
        >
          <option value="">Todos los canales</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filtrar por persona"
          className="h-8 w-auto min-w-32 text-[12.5px]"
          value={filters.assigneeId ?? ""}
          onChange={(event) => onChange({ ...filters, assigneeId: event.target.value || null })}
        >
          <option value="">Todo el equipo</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.profile.full_name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filtrar por vencimiento"
          className="h-8 w-auto min-w-32 text-[12.5px]"
          value={filters.due}
          onChange={(event) =>
            onChange({ ...filters, due: event.target.value as BoardFilters["due"] })
          }
        >
          <option value="all">Vencimiento</option>
          <option value="overdue">Vencidos</option>
          <option value="week">Esta semana</option>
          <option value="none">Sin fecha</option>
        </Select>

        {filtered ? (
          <button
            type="button"
            onClick={() => onChange({ channelId: null, assigneeId: null, due: "all", query: "" })}
            className="text-ink-500 hover:text-ink-900 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px]"
          >
            <X className="size-3.5" aria-hidden />
            Limpiar
          </button>
        ) : (
          <span className="text-ink-400 ring-line grid size-8 place-items-center rounded-lg ring-1">
            <ListFilter className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}
