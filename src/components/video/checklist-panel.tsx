"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Input } from "@/components/ui/field";
import { Progress } from "@/components/ui/misc";
import { addChecklistItem, deleteChecklistItem, setChecklistDone } from "@/lib/api/board";
import { cn, errorMessage } from "@/lib/utils";

export interface ChecklistRow {
  id: string;
  title: string;
  is_done: boolean;
  position: number;
}

export function ChecklistPanel({ videoId, initial }: { videoId: string; initial: ChecklistRow[] }) {
  const { can } = useWorkspace();
  const [items, setItems] = React.useState<ChecklistRow[]>(
    [...initial].sort((a, b) => a.position - b.position),
  );
  const [title, setTitle] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const done = items.filter((item) => item.is_done).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  const editable = can("video.edit");

  async function toggle(item: ChecklistRow) {
    const next = !item.is_done;
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, is_done: next } : row)),
    );
    try {
      await setChecklistDone(item.id, next);
    } catch (error) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, is_done: item.is_done } : row)),
      );
      toast.error(errorMessage(error));
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;

    setAdding(true);
    try {
      const position = (items.at(-1)?.position ?? 0) + 1000;
      const created = await addChecklistItem(videoId, clean, position);
      setItems((current) => [...current, created as ChecklistRow]);
      setTitle("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    const snapshot = items;
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await deleteChecklistItem(id);
    } catch (error) {
      setItems(snapshot);
      toast.error(errorMessage(error));
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-ink-900 text-[14px] font-semibold">Checklist de producción</h2>
        <span className="text-ink-400 text-[12px]">
          {done}/{items.length}
        </span>
      </div>

      <Progress value={progress} className="mb-3" />

      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5">
            <input
              type="checkbox"
              checked={item.is_done}
              disabled={!editable}
              onChange={() => toggle(item)}
              className="accent-brand-500 size-4 shrink-0 cursor-pointer rounded"
              aria-label={item.title}
            />
            <span
              className={cn(
                "flex-1 text-[13px]",
                item.is_done ? "text-ink-400 line-through" : "text-ink-700",
              )}
            >
              {item.title}
            </span>
            {editable ? (
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Eliminar ${item.title}`}
                className="text-ink-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {editable ? (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Añadir paso (ej. subtitulos revisados)"
            className="h-8 text-[13px]"
            maxLength={200}
          />
          <button
            type="submit"
            disabled={adding || !title.trim()}
            aria-label="Añadir paso"
            className="bg-canvas text-ink-500 hover:text-ink-900 ring-line grid size-8 shrink-0 place-items-center rounded-lg ring-1 transition disabled:opacity-50"
          >
            <Plus className="size-4" />
          </button>
        </form>
      ) : null}
    </section>
  );
}
