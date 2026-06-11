"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";
import { createTask } from "@/modules/planning/task-actions";

const emptyState: ActionResult = { error: null };

interface AssigneeOption {
  id: string;
  firstName: string;
  lastName: string;
  unit: string | null;
}

export function CreateTaskForm({ assignees }: { assignees: AssigneeOption[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createTask,
    emptyState,
  );

  useEffect(() => {
    if (state.error === null && state !== emptyState) {
      toast.success("Tâche ajoutée.");
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-2xl bg-snow p-4 shadow-card"
    >
      <div className="space-y-1.5">
        <Label htmlFor="title">Nouvelle tâche</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="Ranger le local, acheter le bois pour la croix…"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="assigneeId">Responsable (optionnel)</Label>
          <select
            id="assigneeId"
            name="assigneeId"
            defaultValue=""
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            <option value="">Personne</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName}
                {a.unit ? ` · ${a.unit}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="dueDate">Échéance (optionnel)</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            className="w-full min-w-0 appearance-none"
          />
        </div>
      </div>
      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
    </form>
  );
}
