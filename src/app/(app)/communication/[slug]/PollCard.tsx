"use client";

import { BarChart3, Check, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { closePoll, votePoll } from "@/modules/communication/poll-actions";
import type { PollWithVotes } from "@/modules/communication/poll-actions";

export function PollCard({
  poll,
  currentUserId,
  isStaff,
  onChanged,
}: {
  poll: PollWithVotes;
  currentUserId: string;
  isStaff: boolean;
  onChanged: () => void;
}) {
  const options = (() => {
    try {
      return JSON.parse(poll.options) as { id: string; label: string }[];
    } catch {
      return [];
    }
  })();

  // `loadPolls` auto-clôt côté serveur les sondages échus → ici on lit
  // simplement closedAt (pas de calcul de date impur au rendu).
  const closed = poll.closedAt !== null;

  const total = poll.votes.length;
  const countByOption = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of poll.votes) {
    countByOption.set(v.optionId, (countByOption.get(v.optionId) ?? 0) + 1);
    if (v.userId === currentUserId) mine.add(v.optionId);
  }

  async function vote(optionId: string) {
    if (closed) return;
    await votePoll(poll.id, optionId);
    onChanged();
  }
  async function handleClose() {
    await closePoll(poll.id);
    onChanged();
  }

  const canClose = !closed && (isStaff || poll.authorId === currentUserId);

  return (
    <div className="rounded-2xl border border-sky/40 bg-sky-soft/30 p-4">
      <div className="flex items-start gap-2">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-sky-ink" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-earth">{poll.question}</p>
          <p className="text-xs text-trail">
            Sondage de {poll.author.firstName} {poll.author.lastName}
            {poll.allowMultiple ? " · choix multiples" : ""}
            {closed ? " · clôturé" : ""}
          </p>
        </div>
        {canClose ? (
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-trail hover:bg-snow"
            title="Clôturer le sondage"
          >
            <Lock className="size-3" />
            Clôturer
          </button>
        ) : null}
      </div>

      <ul className="mt-3 space-y-2">
        {options.map((opt) => {
          const count = countByOption.get(opt.id) ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const voted = mine.has(opt.id);
          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => vote(opt.id)}
                disabled={closed}
                className={cn(
                  "relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  voted
                    ? "border-forest bg-forest-soft"
                    : "border-stone bg-snow hover:bg-sand",
                  closed && "cursor-default",
                )}
              >
                {/* barre de résultat */}
                <span
                  className="absolute inset-y-0 left-0 bg-sky/20"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium text-earth">
                    {voted ? <Check className="size-4 text-forest" /> : null}
                    {opt.label}
                  </span>
                  <span className="text-xs font-bold text-trail">
                    {count} · {pct}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-trail">
        {total} vote{total > 1 ? "s" : ""}
      </p>
    </div>
  );
}
