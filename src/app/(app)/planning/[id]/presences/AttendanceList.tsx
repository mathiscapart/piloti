"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import { UNIT_LABEL, type Unit } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { setAttendance } from "@/modules/planning/actions";

interface RosterUser {
  id: string;
  firstName: string;
  lastName: string;
  image?: string | null;
  unit?: string | null;
}
interface RosterEntry {
  user: RosterUser;
  present: boolean | null;
}

// US-P07 — pointage rapide, mobile-first : on tape une ligne pour basculer
// présent/absent. Sauvegarde immédiate (optimiste), modifiable à tout moment.
export function AttendanceList({
  eventId,
  roster,
}: {
  eventId: string;
  roster: RosterEntry[];
}) {
  const [present, setPresent] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(roster.map((r) => [r.user.id, r.present === true])),
  );
  const [, start] = useTransition();

  function toggle(userId: string) {
    const next = !present[userId];
    setPresent((s) => ({ ...s, [userId]: next })); // optimiste
    start(async () => {
      const res = await setAttendance(eventId, userId, next);
      if (res?.error) {
        setPresent((s) => ({ ...s, [userId]: !next })); // rollback
        toast.error(res.error);
      }
    });
  }

  const count = Object.values(present).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-earth">
        {count} / {roster.length} présent{count > 1 ? "s" : ""}
      </p>

      {roster.length === 0 ? (
        <p className="text-sm text-trail">
          Aucun jeune rattaché à cet événement.
        </p>
      ) : (
        <ul className="space-y-2">
          {roster.map(({ user }) => {
            const isPresent = present[user.id];
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => toggle(user.id)}
                  aria-pressed={isPresent}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                    isPresent
                      ? "border-forest bg-forest-soft"
                      : "border-stone/50 bg-snow",
                  )}
                >
                  <UserAvatar
                    image={user.image}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    className="size-10"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-earth">
                      {user.firstName} {user.lastName}
                    </span>
                    {user.unit ? (
                      <span className="block truncate text-xs text-trail">
                        {UNIT_LABEL[user.unit as Unit] ?? user.unit}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isPresent
                        ? "border-forest bg-forest text-snow"
                        : "border-stone/60 text-transparent",
                    )}
                  >
                    <Check className="size-5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
