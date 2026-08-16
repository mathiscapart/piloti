"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_LABEL, type Unit } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { addReview } from "@/modules/camp/place-actions";

// US-L07 — camps déjà tenus sur ce lieu, pour rattacher l'avis à l'un d'eux.
export interface ReviewCampOption {
  id: string;
  name: string;
  unit: string | null;
  year: number;
}

export function ReviewForm({
  placeId,
  camps,
}: {
  placeId: string;
  camps: ReviewCampOption[];
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [eventId, setEventId] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (rating < 1) {
      toast.error("Choisis une note (1 à 5 étoiles).");
      return;
    }
    start(async () => {
      const res = await addReview(
        placeId,
        String(rating),
        comment,
        eventId || undefined,
      );
      if (res.error) toast.error(res.error);
      else {
        toast.success("Avis publié.");
        setRating(0);
        setComment("");
        setEventId("");
        router.refresh();
      }
    });
  }

  const shown = hover || rating;

  return (
    <div className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Déposer un avis</h2>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onClick={() => setRating(i)}
            aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
            className="p-0.5"
          >
            <Star
              className={cn(
                "size-7 transition-colors",
                i <= shown ? "fill-sun text-sun" : "fill-stone/40 text-stone",
              )}
            />
          </button>
        ))}
      </div>
      {camps.length > 0 ? (
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          aria-label="Camp concerné"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-earth"
        >
          <option value="">Camp non précisé</option>
          {camps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.year}
              {c.unit ? ` · ${UNIT_LABEL[c.unit as Unit] ?? c.unit}` : ""}
            </option>
          ))}
        </select>
      ) : null}
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Ton retour sur ce lieu après le camp (accès, eau, voisinage, points forts/faibles)…"
      />
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Publication…" : "Publier l'avis"}
      </Button>
    </div>
  );
}
