"use client";

import { BarChart3, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPoll } from "@/modules/communication/poll-actions";

export function CreatePollDialog({
  channelId,
  onCreated,
}: {
  channelId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setAllowMultiple(false);
    setClosesAt("");
    setError(null);
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await createPoll(channelId, {
        question,
        options,
        allowMultiple,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        reset();
        onCreated();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          title="Créer un sondage"
        >
          <BarChart3 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau sondage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="poll-q">Question</Label>
            <Input
              id="poll-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Qui peut aider au week-end ?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Options</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) =>
                    setOptions((arr) =>
                      arr.map((o, j) => (j === i ? e.target.value : o)),
                    )
                  }
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOptions((arr) => arr.filter((_, j) => j !== i))
                    }
                    className="rounded p-1 text-trail hover:bg-sand"
                    aria-label="Retirer l'option"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((arr) => [...arr, ""])}
              className="inline-flex items-center gap-1 text-sm font-bold text-forest hover:underline"
            >
              <Plus className="size-4" />
              Ajouter une option
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-earth">
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              className="size-4 accent-forest"
            />
            Autoriser plusieurs réponses
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="poll-close">Clôture automatique (optionnel)</Label>
            <Input
              id="poll-close"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full"
            />
          </div>

          {error ? (
            <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Création…" : "Créer le sondage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
