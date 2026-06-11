"use client";

import { Check, Repeat, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import {
  deleteTask,
  toggleTask,
  toggleTaskSignup,
} from "@/modules/planning/task-actions";
import type { TaskVM } from "@/modules/planning/task-vm";

export type { TaskVM };

export function TaskList({ tasks }: { tasks: TaskVM[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [doneState, setDoneState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tasks.map((t) => [t.id, t.done])),
  );

  function toggle(t: TaskVM) {
    if (!t.canToggle) return;
    const next = !doneState[t.id];
    setDoneState((s) => ({ ...s, [t.id]: next }));
    start(async () => {
      const res = await toggleTask(t.id);
      if (res?.error) {
        setDoneState((s) => ({ ...s, [t.id]: !next }));
        toast.error(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function remove(t: TaskVM) {
    if (!confirm(`Supprimer la tâche « ${t.title} » ?`)) return;
    start(async () => {
      const res = await deleteTask(t.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Tâche supprimée.");
        router.refresh();
      }
    });
  }

  function signup(t: TaskVM) {
    start(async () => {
      const res = await toggleTaskSignup(t.id);
      if (res?.error) toast.error(res.error);
      else router.refresh();
    });
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone p-6 text-center text-sm text-trail">
        Aucune tâche.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const done = doneState[t.id];
        return (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-2xl bg-snow p-3 shadow-card"
          >
            <button
              type="button"
              onClick={() => toggle(t)}
              disabled={!t.canToggle || pending}
              aria-pressed={done}
              aria-label={done ? "Marquer à faire" : "Marquer faite"}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                done
                  ? "border-forest bg-forest text-snow"
                  : "border-stone/60 text-transparent",
                t.canToggle ? "cursor-pointer" : "cursor-default opacity-60",
              )}
            >
              <Check className="size-4" />
            </button>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate font-medium",
                  done ? "text-trail line-through" : "text-earth",
                )}
              >
                {t.title}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-trail">
                {t.assigneeFirst ? (
                  <span className="inline-flex items-center gap-1">
                    <UserAvatar
                      image={t.assigneeImage}
                      firstName={t.assigneeFirst}
                      lastName={t.assigneeLast ?? ""}
                      className="size-4 text-[8px]"
                    />
                    {t.assigneeFirst} {t.assigneeLast}
                  </span>
                ) : null}
                {t.dueLabel ? (
                  <span className={cn(t.overdue && "font-bold text-brick")}>
                    {t.overdue ? "En retard · " : "Pour le "}
                    {t.dueLabel}
                  </span>
                ) : null}
                {t.recurrenceLabel ? (
                  <span className="inline-flex items-center gap-1 text-trail">
                    <Repeat className="size-3" />
                    {t.recurrenceLabel}
                  </span>
                ) : null}
              </div>

              {/* US-P11 — inscription groupe */}
              {t.groupTask ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                      t.covered
                        ? "bg-forest-soft text-forest-ink"
                        : "bg-sun-soft text-sun-ink",
                    )}
                  >
                    <Users className="size-3" />
                    {t.signupCount}
                    {t.minRequired > 0 ? `/${t.minRequired}` : ""} inscrit
                    {t.signupCount > 1 ? "s" : ""}
                  </span>
                  {!t.done ? (
                    <button
                      type="button"
                      onClick={() => signup(t)}
                      disabled={pending}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors disabled:opacity-50",
                        t.mySignup
                          ? "border-forest bg-forest text-snow"
                          : "border-stone/60 bg-snow text-earth hover:bg-sand",
                      )}
                    >
                      {t.mySignup ? "Inscrit ✓" : "S'inscrire"}
                    </button>
                  ) : null}
                  {t.signupNames ? (
                    <span className="min-w-0 truncate text-xs text-trail">
                      {t.signupNames}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {t.canDelete ? (
              <button
                type="button"
                onClick={() => remove(t)}
                disabled={pending}
                aria-label="Supprimer"
                className="shrink-0 rounded-full p-2 text-trail transition-colors hover:bg-brick-soft hover:text-brick-ink disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
