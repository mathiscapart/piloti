"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addReview } from "@/modules/camp/place-actions";

export function ReviewForm({ placeId }: { placeId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (rating < 1) {
      toast.error("Choisis une note (1 à 5 étoiles).");
      return;
    }
    start(async () => {
      const res = await addReview(placeId, String(rating), comment);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Avis publié.");
        setRating(0);
        setComment("");
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
