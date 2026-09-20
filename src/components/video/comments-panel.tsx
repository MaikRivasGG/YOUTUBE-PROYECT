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
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export interface CommentRow {
  id: string;
  body: string;
  author_id: string | null;
  created_at: string;
}

export function CommentsPanel({ videoId, initial }: { videoId: string; initial: CommentRow[] }) {
  const { userId, memberById, can, profile } = useWorkspace();
  const [comments, setComments] = React.useState<CommentRow[]>(
    [...initial].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = body.trim();
    if (!clean) return;

    setSending(true);
    try {
      const created = await addComment(videoId, userId, clean);
      setBody("");
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
                  {comment.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {can("comment.write") ? (
        <form onSubmit={submit} className="flex gap-2.5">
          <Avatar id={userId} name={profile.full_name} url={profile.avatar_url} size="md" />
          <div className="flex-1">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  void submit(event);
                }
              }}
              placeholder="Escribe feedback, dudas o notas de revisión..."
              rows={3}
              className="min-h-20 text-[13px]"
              maxLength={4000}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-ink-400 text-[11px]">Ctrl + Enter para enviar</span>
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
