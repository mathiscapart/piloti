"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RSVP_LABEL, RSVP_RESPONSES, type RsvpResponse } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { rsvpEvent } from "@/modules/planning/actions";

const ACTIVE_TONE: Record<RsvpResponse, string> = {
  PRESENT: "bg-forest text-snow",
  ABSENT: "bg-brick text-snow",
  MAYBE: "bg-sun text-earth",
};

// US-P04 — contrôle d'inscription : présent / absent / peut-être, avec un
// commentaire libre optionnel (US-P05, ex : allergie, transport) envoyé avec
// la réponse. La réponse courante est surlignée ; cliquer met à jour (et
// envoie l'email de confirmation).
export function RsvpControl({
  eventId,
  current,
  currentComment,
  closed,
  forUserId,
  withdrawn,
  withdrawalReason,
}: {
  eventId: string;
  current: string | null;
  currentComment?: string | null;
  closed?: boolean;
  // Inscription pour un tiers (enfant rattaché). Absent = pour soi-même.
  forUserId?: string;
  // US-P05 — un chef a désisté cette inscription : le RSVP est bloqué.
  withdrawn?: boolean;
  withdrawalReason?: string | null;
}) {
  const [pending, start] = useTransition();
  const [comment, setComment] = useState(currentComment ?? "");

  function choose(response: string) {
    if (closed || withdrawn) return;
    start(async () => {
      const res = await rsvpEvent(eventId, response, forUserId, comment);
      if (res?.error) toast.error(res.error);
      else toast.success("Réponse enregistrée.");
    });
  }

  if (withdrawn) {
    return (
      <p className="text-sm text-brick-ink">
        Inscription désistée par un chef
        {withdrawalReason ? ` (motif : ${withdrawalReason})` : ""}. Contacte un
        chef pour être réinscrit.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {RSVP_RESPONSES.map((r) => {
          const active = current === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => choose(r)}
              disabled={pending || closed}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                active
                  ? `${ACTIVE_TONE[r as RsvpResponse]} border-transparent`
                  : "border-stone/60 bg-snow text-earth hover:bg-sand",
              )}
            >
              {RSVP_LABEL[r as RsvpResponse]}
            </button>
          );
        })}
      </div>
      {!closed ? (
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={pending}
          placeholder="Commentaire pour le chef (optionnel)"
          className="w-full rounded-xl border border-stone/50 bg-snow px-3 py-1.5 text-sm text-earth placeholder:text-trail"
        />
      ) : null}
    </div>
  );
}
