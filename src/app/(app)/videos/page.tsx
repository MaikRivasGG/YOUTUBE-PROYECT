import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { VideosTable } from "@/components/video/videos-table";
import { requireWorkspace } from "@/lib/session";
import { getBoardVideos, getNotifications } from "@/server/queries";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosPage() {
  const { workspace } = await requireWorkspace();
  const [videos, notifications] = await Promise.all([
    getBoardVideos(workspace.id),
    getNotifications(workspace.id),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Videos"
        subtitle={`${videos.length} videos vivos en ${workspace.name}`}
        notifications={notifications}
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <VideosTable initialVideos={videos} />
      </div>
    </div>
  );
}
