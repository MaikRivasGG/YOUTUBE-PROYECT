"use client";

import { SendHorizonal } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { addComment } from "@/lib/api/board";
import { relative } from "@/lib/dates";
import {
  insertMention,
  matchMentions,
  mentionQueryAt,
  resolveMentions,
  splitMentions,
} from "@/lib/domain/mentions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export interface CommentRow {
  id: string;
  body: string;
  author_id: string | null;
  mentions: string[];
  created_at: string;
}

export function CommentsPanel({ videoId, initial }: { videoId: string; initial: CommentRow[] }) {
  const { userId, memberById, members, can, profile } = useWorkspace();
  const [comments, setComments] = React.useState<CommentRow[]>(
    [...initial].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [caret, setCaret] = React.useState(0);
  const [highlight, setHighlight] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const mentionable = React.useMemo(
    () => members.map((member) => ({ id: member.user_id, full_name: member.profile.full_name })),
    [members],
  );

  const pending = mentionQueryAt(body, caret);
  const suggestions = pending ? matchMentions(mentionable, pending.query) : [];
  // El indice resaltado se recorta en render en vez de en un efecto: si la
  // lista se acorta al escribir, no hace falta un repintado extra.
  const active = suggestions.length === 0 ? 0 : Math.min(highlight, suggestions.length - 1);

  React.useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`comments:${videoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `video_id=eq.${videoId}`,
        },
        (payload) => {
          setComments((current) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string }).id;
              return current.filter((comment) => comment.id !== id);
            }
            const row = payload.new as CommentRow;
            const rest = current.filter((comment) => comment.id !== row.id);
            return [...rest, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId]);

  function choose(index: number) {
    const target = suggestions[index];
    if (!target || !pending) return;

    const next = insertMention(body, pending.start, caret, target);
    setBody(next.text);
    setHighlight(0);

    // El cursor se coloca tras el nombre insertado, no al final del texto.
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = body.trim();
    if (!clean) return;

    setSending(true);
    try {
      const mentions = resolveMentions(clean, mentionable);
      const created = await addComment(videoId, userId, clean, mentions);
      setBody("");
      setCaret(0);
      // Insercion local inmediata; el evento realtime la deduplica por id.
      setComments((current) =>
        current.some((comment) => comment.id === created.id)
          ? current
          : [...current, created as CommentRow],
      );
    } catch (error) {
      toast.error(errorMessage(error, "No hemos podido publicar el comentario"));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((current) => (current + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(active);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCaret(body.length);
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      void submit(event);
    }
  }

  return (
    <section>
      <h2 className="text-ink-900 mb-3 text-[14px] font-semibold">
        Comentarios
        <span className="text-ink-400 ml-1.5 font-normal">{comments.length}</span>
      </h2>

      <ul className="mb-4 space-y-3">
        {comments.length === 0 ? (
          <li className="text-ink-400 text-[12.5px]">
            Sin comentarios todavía. Deja el feedback aquí para que quede registrado.
          </li>
        ) : null}

        {comments.map((comment) => {
          const author = comment.author_id ? memberById(comment.author_id) : undefined;
          const chunks = splitMentions(comment.body, comment.mentions ?? [], mentionable);

          return (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar
                id={comment.author_id ?? "anon"}
                name={author?.full_name ?? "Alguien"}
                url={author?.avatar_url}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-ink-900 text-[13px] font-semibold">
                    {author?.full_name ?? "Alguien"}
                  </span>
                  <span className="text-ink-400 text-[11px]">{relative(comment.created_at)}</span>
                </p>
                <p className="text-ink-700 mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap">
                  {chunks.map((chunk, index) =>
                    chunk.type === "mention" ? (
                      <span
                        key={index}
                        className={
                          chunk.userId === userId
                            ? "bg-brand-100 text-brand-800 rounded px-1 font-medium"
                            : "text-brand-700 font-medium"
                        }
                      >
                        {chunk.value}
                      </span>
                    ) : (
                      <React.Fragment key={index}>{chunk.value}</React.Fragment>
                    ),
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {can("comment.write") ? (
        <form onSubmit={submit} className="flex gap-2.5">
          <Avatar id={userId} name={profile.full_name} url={profile.avatar_url} size="md" />
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setCaret(event.target.selectionStart ?? event.target.value.length);
              }}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              placeholder="Escribe feedback, dudas o notas de revisión... usa @ para avisar a alguien"
              rows={3}
              className="min-h-20 text-[13px]"
              maxLength={4000}
            />

            {suggestions.length > 0 ? (
              <ul
                role="listbox"
                aria-label="Miembros del equipo"
                className="ring-line absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1"
              >
                {suggestions.map((member, index) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(event) => {
                        // mousedown y no click: el blur del textarea cerraria
                        // la lista antes de que llegase el click.
                        event.preventDefault();
                        choose(index);
                      }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition ${
                        index === active ? "bg-canvas text-ink-900" : "text-ink-600"
                      }`}
                    >
                      <Avatar
                        id={member.id}
                        name={member.full_name}
                        url={memberById(member.id)?.avatar_url}
                        size="sm"
                      />
                      <span className="truncate">{member.full_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 flex items-center justify-between">
              <span className="text-ink-400 text-[11px]">
                {suggestions.length > 0
                  ? "↑↓ para elegir · Enter para insertar"
                  : "Ctrl + Enter para enviar"}
              </span>
              <Button type="submit" size="sm" loading={sending} disabled={!body.trim()}>
                <SendHorizonal className="size-3.5" aria-hidden />
                Comentar
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-ink-400 text-[12.5px]">Tu rol es de solo lectura.</p>
      )}
    </section>
  );
}
