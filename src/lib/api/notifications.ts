"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

/** Marca un aviso como leido. Las politicas RLS limitan esto a los propios. */
export async function markNotificationRead(id: number) {
  const supabase = supabaseBrowser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(workspaceId: string) {
  const supabase = supabaseBrowser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .is("read_at", null);
  if (error) throw error;
}
