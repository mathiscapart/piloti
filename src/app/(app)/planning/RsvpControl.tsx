"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { RSVP_LABEL, RSVP_RESPONSES, type RsvpResponse } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { rsvpEvent } from "@/modules/planning/actions";

const ACTIVE_TONE: Record<RsvpResponse, string> = {
  PRESENT: "bg-forest text-snow",
  ABSENT: "bg-brick text-snow",
  MAYBE: "bg-sun text-earth",
};

// US-P04 — contrôle d'inscription : présent / absent / peut-être. La réponse
// courante est surlignée ; cliquer met à jour (et envoie l'email de confirmation).
export function RsvpControl({
  eventId,
  current,
  closed,
  forUserId,
}: {
  eventId: string;
  current: string | null;
  closed?: boolean;
  // Inscription pour un tiers (enfant rattaché). Absent = pour soi-même.
  forUserId?: string;
}) {
  const [pending, start] = useTransition();

  function choose(response: string) {
    if (closed) return;
    start(async () => {
      const res = await rsvpEvent(eventId, response, forUserId);
      if (res?.error) toast.error(res.error);
      else toast.success("Réponse enregistrée.");
    });
  }

  return (
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
  );
}
