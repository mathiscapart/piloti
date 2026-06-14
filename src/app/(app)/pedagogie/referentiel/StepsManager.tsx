"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveStep,
  createStep,
  moveStep,
  updateStep,
} from "@/modules/pedagogy/referential-actions";

interface StepVM {
  id: string;
  name: string;
  description: string | null;
}
interface Group {
  unit: string;
  label: string;
  steps: StepVM[];
}

export function StepsManager({ groups }: { groups: Group[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-earth">Étapes de progression</h2>
      {groups.map((g) => (
        <UnitSteps key={g.unit} group={g} />
      ))}
    </section>
  );
}

function UnitSteps({ group }: { group: Group }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const res = await createStep(group.unit, name, desc);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Étape ajoutée.");
        setName("");
        setDesc("");
        setAdding(false);
        router.refresh();
      }
    });
  }

  function move(id: string, dir: "up" | "down") {
    start(async () => {
      const res = await moveStep(id, dir);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function archive(id: string, n: string) {
    if (!window.confirm(`Archiver l'étape « ${n} » ?`)) return;
    start(async () => {
      const res = await archiveStep(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Étape archivée.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2 rounded-2xl bg-snow p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-earth">{group.label}</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" />
          Étape
        </Button>
      </div>

      {group.steps.length === 0 && !adding ? (
        <p className="text-sm text-trail">Aucune étape pour cette branche.</p>
      ) : null}

      <ol className="space-y-1.5">
        {group.steps.map((s, i) =>
          editId === s.id ? (
            <EditStepRow
              key={s.id}
              step={s}
              onDone={() => {
                setEditId(null);
                router.refresh();
              }}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <li
              key={s.id}
              className="flex items-start gap-2 rounded-xl bg-sand/50 px-3 py-2"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-black text-snow">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-earth">{s.name}</p>
                {s.description ? (
                  <p className="text-xs text-trail">{s.description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  disabled={pending || i === 0}
                  onClick={() => move(s.id, "up")}
                  className="p-1 text-trail hover:text-earth disabled:opacity-30"
                  aria-label="Monter"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={pending || i === group.steps.length - 1}
                  onClick={() => move(s.id, "down")}
                  className="p-1 text-trail hover:text-earth disabled:opacity-30"
                  aria-label="Descendre"
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditId(s.id)}
                  className="p-1 text-trail hover:text-earth"
                  aria-label="Modifier"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => archive(s.id, s.name)}
                  className="p-1 text-brick hover:opacity-80"
                  aria-label="Archiver"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ),
        )}
      </ol>

      {adding ? (
        <div className="space-y-2 rounded-xl bg-sand/60 p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de l'étape"
            className="h-9"
          />
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (facultatif)"
            className="h-9"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={add}>
              Ajouter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditStepRow({
  step,
  onDone,
  onCancel,
}: {
  step: StepVM;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(step.name);
  const [desc, setDesc] = useState(step.description ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateStep(step.id, name, desc);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Étape modifiée.");
        onDone();
      }
    });
  }

  return (
    <li className="space-y-2 rounded-xl bg-sand/60 p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      <Input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description"
        className="h-9"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          Enregistrer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}
