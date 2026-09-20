"use client";

import { ExternalLink, Link2, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { addAsset, deleteAsset } from "@/lib/api/board";
import { assetSchema } from "@/lib/domain/validators";
import { errorMessage } from "@/lib/utils";

export interface AssetRow {
  id: string;
  kind: string;
  label: string;
  url: string;
  created_at: string;
}

const KIND_LABELS: Record<string, string> = {
  script: "Guion",
  voiceover: "Voz en off",
  footage: "Material",
  thumbnail: "Miniatura",
  music: "Musica",
  other: "Otro",
};

export function AssetsPanel({ videoId, initial }: { videoId: string; initial: AssetRow[] }) {
  const { can, userId } = useWorkspace();
  const [assets, setAssets] = React.useState<AssetRow[]>(initial);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const parsed = assetSchema.safeParse({
      video_id: videoId,
      kind: form.get("kind"),
      label: form.get("label") ?? "",
      url: form.get("url"),
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    setSaving(true);
    try {
      const created = await addAsset({ ...parsed.data, created_by: userId });
      setAssets((current) => [...current, created as AssetRow]);
      setOpen(false);
      event.currentTarget.reset();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const snapshot = assets;
    setAssets((current) => current.filter((asset) => asset.id !== id));
    try {
      await deleteAsset(id);
    } catch (error) {
      setAssets(snapshot);
      toast.error(errorMessage(error));
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-ink-900 text-[14px] font-semibold">Archivos y enlaces</h2>
        {can("video.edit") ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-brand-600 text-[12px] font-medium hover:underline"
          >
            {open ? "Cancelar" : "Añadir enlace"}
          </button>
        ) : null}
      </div>

      {open ? (
        <form onSubmit={submit} className="bg-canvas mb-3 space-y-2 rounded-lg p-2.5">
          <div className="flex gap-2">
            <Select name="kind" defaultValue="other" className="h-8 w-32 text-[12.5px]">
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              name="label"
              placeholder="Etiqueta"
              className="h-8 text-[12.5px]"
              maxLength={120}
            />
          </div>
          <Input
            name="url"
            type="url"
            placeholder="https://drive.google.com/..."
            className="h-8 text-[12.5px]"
            required
          />
          <Button type="submit" size="sm" loading={saving} className="w-full justify-center">
            Guardar enlace
          </Button>
        </form>
      ) : null}

      {assets.length === 0 ? (
        <p className="text-ink-400 text-[12.5px]">
          Sin archivos. Enlaza aquí el guion, la locucion o el montaje.
        </p>
      ) : (
        <ul className="space-y-1">
          {assets.map((asset) => (
            <li key={asset.id} className="group flex items-center gap-2">
              <Link2 className="text-ink-400 size-3.5 shrink-0" aria-hidden />
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-600 text-ink-700 min-w-0 flex-1 truncate text-[12.5px]"
              >
                {asset.label || KIND_LABELS[asset.kind] || asset.url}
              </a>
              <span className="text-ink-400 hidden text-[11px] sm:inline">
                {KIND_LABELS[asset.kind]}
              </span>
              <ExternalLink className="text-ink-400 size-3 shrink-0" aria-hidden />
              {can("video.edit") ? (
                <button
                  type="button"
                  onClick={() => remove(asset.id)}
                  aria-label="Eliminar enlace"
                  className="text-ink-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
