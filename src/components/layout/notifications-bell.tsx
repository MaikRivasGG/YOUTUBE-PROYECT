"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/menu";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications";
import { relative } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/database";

/** Frase corta para cada tipo de aviso. */
export function describeNotification(notification: Notification): string {
  const payload = notification.payload ?? {};
  const title = typeof payload.title === "string" ? payload.title : "un video";

  switch (notification.type) {
    case "stage.entered":
      return `"${title}" ha entrado en ${String(payload.stage ?? "una etapa nueva")}`;
    case "video.assigned":
      return `Te han asignado "${title}"`;
    case "comment.created":
      return `Nuevo comentario en "${title}": ${String(payload.excerpt ?? "")}`;
    case "video.due_soon":
      return `"${title}" vence mañana`;
    default:
      return title;
  }
}

export function NotificationsBell({ initial }: { initial: Notification[] }) {
  const { workspaceId, userId, memberById } = useWorkspace();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>(initial);
  const [seed, setSeed] = React.useState(initial);

  if (seed !== initial) {
    setSeed(initial);
    setItems(initial);
  }

  React.useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          if (row.workspace_id !== workspaceId) return;
          setItems((current) => [row, ...current].slice(0, 30));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, workspaceId]);

  const unread = items.filter((item) => !item.read_at);

  async function open(notification: Notification, close: () => void) {
    close();
    if (!notification.read_at) {
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
      void markNotificationRead(notification.id).catch(() => undefined);
    }
    if (notification.video_id) router.push(`/videos/${notification.video_id}`);
  }

  return (
    <Menu
      className="w-80"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={
            unread.length > 0 ? `Notificaciones, ${unread.length} sin leer` : "Notificaciones"
          }
          className="bg-canvas text-ink-500 hover:text-ink-900 ring-line relative grid size-9 place-items-center rounded-full ring-1 transition"
        >
          <Bell className="size-4" />
          {unread.length > 0 ? (
            <span className="bg-brand-500 absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="border-line flex items-center justify-between border-b px-2.5 py-2">
            <p className="text-ink-900 text-[13px] font-semibold">Avisos</p>
            {unread.length > 0 ? (
              <button
                type="button"
                className="text-ink-500 hover:text-brand-600 inline-flex items-center gap-1 text-[11.5px]"
                onClick={() => {
                  const now = new Date().toISOString();
                  setItems((current) =>
                    current.map((item) => ({ ...item, read_at: item.read_at ?? now })),
                  );
                  void markAllNotificationsRead(workspaceId).catch(() => undefined);
                }}
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Marcar todo
              </button>
            ) : null}
          </div>

          <ul className="scrollbar-slim max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="text-ink-400 px-2.5 py-6 text-center text-[12.5px]">
                No tienes avisos todavia
              </li>
            ) : null}

            {items.map((notification) => {
              const actor = notification.actor_id ? memberById(notification.actor_id) : undefined;
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => open(notification, close)}
                    className={cn(
                      "hover:bg-canvas flex w-full gap-2.5 px-2.5 py-2 text-left transition",
                      !notification.read_at && "bg-brand-50/60",
                    )}
                  >
                    <Avatar
                      id={notification.actor_id ?? "sistema"}
                      name={actor?.full_name ?? "Equipo"}
                      url={actor?.avatar_url}
                      size="sm"
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-700 block text-[12.5px] leading-snug">
                        {describeNotification(notification)}
                      </span>
                      <span className="text-ink-400 text-[11px]">
                        {relative(notification.created_at)}
                      </span>
                    </span>
                    {!notification.read_at ? (
                      <span className="bg-brand-500 mt-1.5 size-1.5 shrink-0 rounded-full" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Menu>
  );
}
