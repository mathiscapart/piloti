"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * US-19 — vignettes de photos d'incident cliquables : un clic ouvre la photo
 * en grand dans une modale (lightbox).
 */
export function IncidentPhotos({ photos }: { photos: string[] }) {
  const [active, setActive] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <li key={url}>
            <button
              type="button"
              onClick={() => setActive(url)}
              className="block overflow-hidden rounded-lg ring-offset-2 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              aria-label="Agrandir la photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Photo de l'incident"
                className="size-16 rounded-lg object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Photo de l&apos;incident</DialogTitle>
          {active ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active}
              alt="Photo de l'incident en grand"
              className="max-h-[80vh] w-full rounded-2xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
