/**
 * Extrae el ID de un video de YouTube pegado en cualquier formato habitual
 * (watch?v=, youtu.be/, shorts/, embed/) para derivar su miniatura publica sin
 * necesitar una API key.
 */
export function extractYouTubeId(url: string): string | null {
  const clean = url.trim();
  if (!clean) return null;

  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");

      const match = parsed.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
      if (match) return match[2];
    }

    return null;
  } catch {
    return null;
  }
}

/** Miniatura publica de un video de YouTube, sin API key. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
