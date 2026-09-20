"use client";

import { Check, ChevronDown, Plus, Trash2, UserPlus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/field";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { Progress } from "@/components/ui/misc";
import {
  addChecklistItem,
  deleteChecklistItem,
  setChecklistDone,
  toggleChecklistAssignee,
  updateChecklistItem,
} from "@/lib/api/board";
import { relative } from "@/lib/dates";
import { cn, errorMessage } from "@/lib/utils";

export interface ChecklistRow {
  id: string;
  title: string;
  stage_id: string | null;
  role_id: string | null;
  is_done: boolean;
  done_at: string | null;
  completed_by: string | null;
  position: number;
  checklist_assignees: { user_id: string }[];
}

export function ChecklistPanel({ videoId, initial }: { videoId: string; initial: ChecklistRow[] }) {
  const { can, roles, members, memberById, roleById, myRoles } = useWorkspace();
  const [items, setItems] = React.useState<ChecklistRow[]>(
    [...initial].sort((a, b) => a.position - b.position),
  );
  const [title, setTitle] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const done = items.filter((item) => item.is_done).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  const editable = can("video.edit");
  const myRoleIds = new Set(myRoles.map((role) => role.id));

  /** Un paso sin rol lo marca cualquiera; con rol, solo quien lo lleva. */
  function canComplete(item: ChecklistRow): boolean {
    if (!editable) return false;
    if (!item.role_id) return true;
    if (can("video.move.any")) return true;
    return myRoleIds.has(item.role_id);
  }

  async function toggle(item: ChecklistRow) {
    const next = !item.is_done;
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, is_done: next } : row)),
    );

    try {
      const saved = await setChecklistDone(item.id, next);
      setItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                is_done: saved.is_done,
                completed_by: saved.completed_by,
                done_at: saved.done_at,
              }
            : row,
        ),
      );
    } catch (error) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, is_done: item.is_done } : row)),
      );
      const message =
        error instanceof Error && error.message === "CHECKLIST_ROLE_MISMATCH"
          ? `Este paso lo marca ${roleById(item.role_id)?.name ?? "otro rol"}`
          : errorMessage(error);
      toast.error(message);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;

    setAdding(true);
    try {
      const created = await addChecklistItem({
        video_id: videoId,
        title: clean,
        position: (items.at(-1)?.position ?? 0) + 1000,
        role_id: roleId || null,
      });
      setItems((current) => [
        ...current,
        { ...(created as unknown as ChecklistRow), checklist_assignees: [] },
      ]);
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

  async function assign(item: ChecklistRow, userId: string) {
    const assigned = item.checklist_assignees.some((a) => a.user_id === userId);
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? {
              ...row,
              checklist_assignees: assigned
                ? row.checklist_assignees.filter((a) => a.user_id !== userId)
                : [...row.checklist_assignees, { user_id: userId }],
            }
          : row,
      ),
    );

    try {
      await toggleChecklistAssignee(item.id, userId, !assigned);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function changeRole(item: ChecklistRow, value: string) {
    const previous = item.role_id;
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, role_id: value || null } : row)),
    );
    try {
      await updateChecklistItem(item.id, { role_id: value || null });
    } catch (error) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, role_id: previous } : row)),
      );
      toast.error(errorMessage(error));
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-ink-900 text-[14px] font-semibold">Checklist de produccion</h2>
        <span className="text-ink-400 text-[12px]">
          {done}/{items.length}
        </span>
      </div>

      <Progress value={progress} className="mb-3" />

      <ul className="space-y-2">
        {items.map((item) => {
          const role = roleById(item.role_id);
          const completer = item.completed_by ? memberById(item.completed_by) : undefined;
          const people = item.checklist_assignees
            .map((a) => memberById(a.user_id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p));
          const allowed = canComplete(item);

          return (
            <li key={item.id} className="group rounded-lg px-1 py-1">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={item.is_done}
                  disabled={!allowed}
                  onChange={() => toggle(item)}
                  title={allowed ? undefined : `Este paso lo marca ${role?.name ?? "otro rol"}`}
                  className="accent-brand-500 mt-0.5 size-4 shrink-0 cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={item.title}
                />

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[13px]",
                      item.is_done ? "text-ink-400 line-through" : "text-ink-700",
                    )}
                  >
                    {item.title}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {role ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{ backgroundColor: `${role.color}1a`, color: role.color }}
                      >
                        {role.name}
                      </span>
                    ) : (
                      <span className="text-ink-400 text-[10.5px]">Abierto a cualquiera</span>
                    )}

                    {people.length > 0 ? (
                      <span className="flex -space-x-1">
                        {people.map((person) => (
                          <Avatar
                            key={person.id}
                            id={person.id}
                            name={person.full_name}
                            url={person.avatar_url}
                            size="xs"
                          />
                        ))}
                      </span>
                    ) : null}

                    {item.is_done && completer ? (
                      <span className="text-ink-400 inline-flex items-center gap-1 text-[10.5px]">
                        <Check className="size-3 text-emerald-600" aria-hidden />
                        {completer.full_name.split(" ")[0]} · {relative(item.done_at)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {editable ? (
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <Menu
                      className="w-56"
                      trigger={({ toggle: openMenu }) => (
                        <button
                          type="button"
                          onClick={openMenu}
                          aria-label="Responsables del paso"
                          className="text-ink-400 hover:text-ink-900 rounded-md p-1 transition"
                        >
                          <UserPlus className="size-3.5" />
                        </button>
                      )}
                    >
                      {() => (
                        <>
                          <MenuLabel>Responsables</MenuLabel>
                          {members.map((member) => {
                            const isOn = item.checklist_assignees.some(
                              (a) => a.user_id === member.user_id,
                            );
                            return (
                              <MenuItem
                                key={member.user_id}
                                onClick={() => assign(item, member.user_id)}
                              >
                                <Avatar
                                  id={member.profile.id}
                                  name={member.profile.full_name}
                                  url={member.profile.avatar_url}
                                  size="xs"
                                />
                                <span className="flex-1 truncate">{member.profile.full_name}</span>
                                {isOn ? (
                                  <Check className="text-brand-600 size-3.5" aria-hidden />
                                ) : null}
                              </MenuItem>
                            );
                          })}
                        </>
                      )}
                    </Menu>

                    <Menu
                      className="w-52"
                      trigger={({ toggle: openMenu }) => (
                        <button
                          type="button"
                          onClick={openMenu}
                          aria-label="Rol que completa el paso"
                          className="text-ink-400 hover:text-ink-900 rounded-md p-1 transition"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                      )}
                    >
                      {({ close }) => (
                        <>
                          <MenuLabel>Lo completa</MenuLabel>
                          <MenuItem
                            onClick={() => {
                              close();
                              changeRole(item, "");
                            }}
                          >
                            Cualquiera
                          </MenuItem>
                          {roles.map((option) => (
                            <MenuItem
                              key={option.id}
                              onClick={() => {
                                close();
                                changeRole(item, option.id);
                              }}
                            >
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: option.color }}
                              />
                              <span className="flex-1 truncate">{option.name}</span>
                              {option.id === item.role_id ? (
                                <Check className="text-brand-600 size-3.5" aria-hidden />
                              ) : null}
                            </MenuItem>
                          ))}
                        </>
                      )}
                    </Menu>

                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      aria-label={`Eliminar ${item.title}`}
                      className="text-ink-400 rounded-md p-1 transition hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {editable ? (
        <form onSubmit={add} className="mt-3 space-y-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Anadir paso (ej. subtitulos revisados)"
            className="h-8 text-[13px]"
            maxLength={200}
          />
          <div className="flex gap-2">
            <Select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              aria-label="Rol que lo completa"
              className="h-8 flex-1 text-[12.5px]"
            >
              <option value="">Lo completa cualquiera</option>
              {roles.map((option) => (
                <option key={option.id} value={option.id}>
                  Lo completa: {option.name}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              disabled={adding || !title.trim()}
              aria-label="Anadir paso"
              className="bg-canvas text-ink-500 hover:text-ink-900 ring-line grid size-8 shrink-0 place-items-center rounded-lg ring-1 transition disabled:opacity-50"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
