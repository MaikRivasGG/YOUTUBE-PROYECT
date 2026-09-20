import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { VideoDetailView } from "@/components/video/video-detail";
import { requireWorkspace } from "@/lib/session";
import { getVideoDetail } from "@/server/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await getVideoDetail(id);
  return { title: video?.title ?? "Video" };
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await requireWorkspace();
  const { id } = await params;
  const video = await getVideoDetail(id);

  if (!video || video.workspace_id !== workspace.id) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={video.title} subtitle={`${video.ref} - ficha de producción`} />
      <VideoDetailView video={video} />
    </div>
  );
}
