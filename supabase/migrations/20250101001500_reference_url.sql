-- ---------------------------------------------------------------------------
-- Miniatura de referencia al crear un video: un link de YouTube ajeno usado
-- como referencia visual/de estilo. Se guarda solo el link; la miniatura se
-- deriva en el cliente via img.youtube.com (sin API key, sin duplicar dato).
--
-- No confundir con videos.youtube_url/thumbnail_url, que son el propio video
-- ya publicado.
-- ---------------------------------------------------------------------------

alter table public.videos
  add column reference_url text
    check (reference_url is null or reference_url ~* '^https?://');
