"use client";

import { Camera, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const MAX_PHOTOS = 5;

export function PhotoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos.`);
      return;
    }
    const files = Array.from(fileList).slice(0, remainingSlots);

    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          toast.error(data.error ?? "Upload échoué.");
          continue;
        }
        uploaded.push(data.url);
      }
    } finally {
      setUploading(false);
    }
    if (uploaded.length > 0) {
      setPhotos((p) => [...p, ...uploaded]);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePhoto(url: string) {
    setPhotos((p) => p.filter((u) => u !== url));
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Hidden inputs portés dans le formData */}
      {photos.map((url) => (
        <input key={url} type="hidden" name="photo" value={url} />
      ))}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((url) => (
            <li
              key={url}
              className="group relative aspect-square overflow-hidden rounded-xl bg-sand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Photo de l'incident"
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                aria-label="Retirer cette photo"
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-brick text-snow opacity-90 shadow-card transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || photos.length >= MAX_PHOTOS}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Camera className="size-4" />
        )}
        {uploading
          ? "Upload…"
          : photos.length === 0
            ? "Ajouter des photos"
            : `Ajouter une photo (${photos.length}/${MAX_PHOTOS})`}
      </Button>
      <p className="text-xs text-trail">
        Max {MAX_PHOTOS} photos · 10 Mo chacune · les images sont
        redimensionnées et converties en WebP côté serveur.
      </p>
    </div>
  );
}
