"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { uploadImage } from "@/lib/api/storage";
import { cn, errorMessage, initials } from "@/lib/utils";

/**
 * Selector de imagen con vista previa.
 *
 * Sube el fichero a Storage y devuelve la URL publica; quien manda sobre el
 * permiso es la carpeta (`folder`), que las politicas de Storage comprueban.
 */
export function ImageUpload({
  bucket,
  folder,
  value,
  onChange,
  label,
  fallback,
  color,
  rounded = "full",
  disabled,
}: {
  bucket: "avatars" | "channels";
  folder: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  /** Texto para las iniciales cuando no hay imagen. */
  fallback: string;
  color?: string;
  rounded?: "full" | "xl";
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadImage(bucket, folder, file);
      onChange(url);
    } catch (error) {
      toast.error(errorMessage(error, "No hemos podido subir la imagen"));
    } finally {
      setUploading(false);
    }
  }

  const shape = rounded === "full" ? "rounded-full" : "rounded-xl";

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "ring-line grid size-14 shrink-0 place-items-center overflow-hidden text-sm font-bold text-white ring-1",
          shape,
        )}
        style={{ backgroundColor: value ? undefined : (color ?? "#94a3b8") }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen subida por el equipo
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          initials(fallback)
        )}
      </span>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="bg-surface text-ink-700 ring-line hover:bg-canvas inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium ring-1 transition disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-3.5" aria-hidden />
            )}
            {value ? "Cambiar" : label}
          </button>

          {value ? (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
              aria-label="Quitar imagen"
              className="text-ink-400 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <p className="text-ink-400 text-[11px]">JPG, PNG, WEBP o GIF · maximo 2 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
