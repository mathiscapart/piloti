"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { addRegistration } from "@/modules/planning/actions";

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
}

// US-P05 — un chef inscrit manuellement un jeune (cas particulier, ou pour
// relever une inscription désistée).
export function AddRegistrationControl({
  eventId,
  candidates,
}: {
  eventId: string;
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [pending, start] = useTransition();

  if (candidates.length === 0) return null;

  function onAdd() {
    if (!selected) return;
    start(async () => {
      const res = await addRegistration(eventId, selected);
      if (res?.error) toast.error(res.error);
      else toast.success("Jeune inscrit.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-earth"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.firstName} {c.lastName}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" disabled={pending} onClick={onAdd}>
        Ajouter
      </Button>
    </div>
  );
}
