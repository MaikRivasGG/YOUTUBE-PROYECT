import type { Metadata } from "next";

import { ChannelsPanel, type ChannelStats } from "@/components/channels/channels-panel";
import { PageHeader } from "@/components/layout/page-header";
import { requireWorkspace } from "@/lib/session";
import { getBoardVideos, getChannels, getNotifications } from "@/server/queries";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Canales" };

export default async function ChannelsPage() {
  const { workspace } = await requireWorkspace();
  const supabase = await supabaseServer();

  const [channels, videos, published, notifications] = await Promise.all([
    getChannels(workspace.id, true),
    getBoardVideos(workspace.id),
    supabase
      .from("videos")
      .select("channel_id, published_at")
      .eq("workspace_id", workspace.id)
      .not("published_at", "is", null)
      .gte(
        "published_at",
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      ),
    getNotifications(workspace.id),
  ]);

  const stats: Record<string, ChannelStats> = {};
  for (const channel of channels) {
    stats[channel.id] = { active: 0, publishedThisMonth: 0 };
  }

  for (const video of videos) {
    if (!video.channel_id) continue;
    const entry = stats[video.channel_id];
    if (entry && !video.published_at) entry.active += 1;
  }

  for (const row of published.data ?? []) {
    if (!row.channel_id) continue;
    const entry = stats[row.channel_id];
    if (entry) entry.publishedThisMonth += 1;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Canales"
        subtitle={`${channels.length} canales en ${workspace.name}`}
        notifications={notifications}
      />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <ChannelsPanel channels={channels} stats={stats} />
      </div>
    </div>
  );
}
