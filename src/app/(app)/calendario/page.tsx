import type { Metadata } from "next";

import { EditorialCalendar } from "@/components/calendar/editorial-calendar";
import { PageHeader } from "@/components/layout/page-header";
import { requireWorkspace } from "@/lib/session";
import { getBoardVideos, getNotifications } from "@/server/queries";

export const metadata: Metadata = { title: "Calendario editorial" };

export default async function CalendarPage() {
  const { workspace } = await requireWorkspace();
  const [videos, notifications] = await Promise.all([
    getBoardVideos(workspace.id),
    getNotifications(workspace.id),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        notifications={notifications}
        title="Calendario editorial"
        subtitle="Fecha de publicación programada, o fecha limite si aún no hay hora fijada"
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <EditorialCalendar initialVideos={videos} />
      </div>
    </div>
  );
}
