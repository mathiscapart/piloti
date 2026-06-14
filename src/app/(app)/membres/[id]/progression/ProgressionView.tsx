"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Progression } from "@/modules/pedagogy/progression";
import {
  addNote,
  awardBadge,
  confirmStep,
  deleteGoal,
  deleteNote,
  proposeStep,
  removeValidation,
  revokeBadge,
  setGoal,
  toggleGoal,
} from "@/modules/pedagogy/progression-actions";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DATETIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

interface BadgeOption {
  id: string;
  name: string;
  icon: string | null;
}

export function ProgressionView({
  jeuneId,
  data,
  canManage,
  currentUserId,
  awardableBadges,
}: {
  jeuneId: string;
  data: Progression;
  canManage: boolean;
  currentUserId: string;
  awardableBadges: BadgeOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();

  function run(fn: () => Promise<{ error: string | null }>, ok?: string) {
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        if (ok) toast.success(ok);
        refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Synthèse */}
      <div className="flex items-center gap-3 rounded-2xl bg-snow p-4 shadow-card">
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full bg-forest-soft">
          <span className="text-lg font-black text-forest-ink">
            {data.confirmedCount}
          </span>
          <span className="text-[10px] font-bold text-forest-ink">
            /{data.totalSteps}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-earth">Étapes validées</p>
          {data.nextStep ? (
            <p className="text-sm text-trail">
              Prochaine : <span className="font-bold">{data.nextStep.name}</span>
            </p>
          ) : data.totalSteps > 0 ? (
            <p className="text-sm text-forest">Toutes les étapes sont validées 🎉</p>
          ) : (
            <p className="text-sm text-trail">Aucune étape définie pour la branche.</p>
          )}
        </div>
      </div>

      {/* Frise d'étapes */}
      {data.steps.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-earth">Frise de progression</h2>
          <ol className="space-y-2">
            {data.steps.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-2xl bg-snow p-3 shadow-card"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black",
                    s.status === "CONFIRMED"
                      ? "bg-forest text-snow"
                      : s.status === "PROPOSED"
                        ? "bg-sun text-sun-ink"
                        : "bg-stone/40 text-earth",
                  )}
                >
                  {s.status === "CONFIRMED" ? <Check className="size-3.5" /> : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-earth">{s.name}</p>
                  {s.description ? (
                    <p className="text-xs text-trail">{s.description}</p>
                  ) : null}
                  {s.status === "CONFIRMED" && s.confirmedBy ? (
                    <p className="text-xs text-forest">
                      Validé par {s.confirmedBy.firstName} {s.confirmedBy.lastName}
                      {s.confirmedAt ? ` · ${DATETIME_FMT.format(s.confirmedAt)}` : ""}
                    </p>
                  ) : s.status === "PROPOSED" && s.proposedBy ? (
                    <p className="text-xs text-sun-ink">
                      Proposé par {s.proposedBy.firstName} {s.proposedBy.lastName} —
                      en attente d&apos;une 2e validation
                    </p>
                  ) : null}

                  {canManage ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.status === "NONE" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => proposeStep(jeuneId, s.id), "Validation proposée.")}
                        >
                          Proposer la validation
                        </Button>
                      ) : null}
                      {s.status === "PROPOSED" ? (
                        <>
                          {s.proposedBy?.id === currentUserId ? (
                            <span className="self-center text-xs text-trail">
                              En attente d&apos;un autre chef pour confirmer
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={pending}
                              onClick={() => run(() => confirmStep(jeuneId, s.id), "Étape validée.")}
                            >
                              Confirmer
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => run(() => removeValidation(jeuneId, s.id))}
                          >
                            Retirer
                          </Button>
                        </>
                      ) : null}
                      {s.status === "CONFIRMED" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => removeValidation(jeuneId, s.id))}
                        >
                          Annuler la validation
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {canManage ? (
            <p className="text-xs text-trail">
              Règle SGDF : une étape doit être confirmée par un 2e chef (différent
              du proposeur).
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Badges */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-earth">Badges ({data.badges.length})</h2>
        {data.badges.length === 0 ? (
          <p className="text-sm text-trail">Aucun badge pour le moment.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.badges.map((b) => (
              <li
                key={b.awardId}
                className="flex items-center gap-2 rounded-full bg-snow px-3 py-1.5 shadow-card"
              >
                <span className="text-lg">{b.icon ?? "🏅"}</span>
                <span className="text-sm font-bold text-earth">{b.name}</span>
                {canManage ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeBadge(b.awardId), "Badge retiré.")}
                    className="text-brick hover:opacity-80"
                    aria-label="Retirer le badge"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage && awardableBadges.length > 0 ? (
          <AwardBadge
            jeuneId={jeuneId}
            badges={awardableBadges}
            pending={pending}
            onAward={(badgeId) =>
              run(() => awardBadge(badgeId, [jeuneId]), "Badge attribué.")
            }
          />
        ) : null}
      </section>

      {/* Objectifs */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-earth">Objectifs</h2>
        {data.goals.length === 0 ? (
          <p className="text-sm text-trail">Aucun objectif défini.</p>
        ) : (
          <ul className="space-y-2">
            {data.goals.map((g) => (
              <li
                key={g.id}
                className="flex items-start gap-3 rounded-2xl bg-snow p-3 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-bold",
                      g.status === "ACHIEVED" ? "text-trail line-through" : "text-earth",
                    )}
                  >
                    {g.title}
                  </p>
                  <p className="text-xs text-trail">
                    {g.target ? `Cible : ${g.target}` : "Objectif libre"}
                    {g.dueDate ? ` · échéance ${DATE_FMT.format(g.dueDate)}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                    g.status === "ACHIEVED"
                      ? "bg-forest-soft text-forest-ink"
                      : "bg-sun-soft text-sun-ink",
                  )}
                >
                  {g.status === "ACHIEVED" ? "Atteint" : "En cours"}
                </span>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => toggleGoal(g.id))}
                      className="p-1 text-forest hover:opacity-80"
                      aria-label="Basculer atteint"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteGoal(g.id))}
                      className="p-1 text-brick hover:opacity-80"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <GoalForm
            jeuneId={jeuneId}
            steps={data.steps.map((s) => ({ id: s.id, name: s.name }))}
            badges={awardableBadges}
            pending={pending}
            onCreated={refresh}
          />
        ) : null}
      </section>

      {/* Notes (encadrement uniquement) */}
      {canManage ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-earth">
            Notes de suivi
            <span className="ml-2 align-middle text-xs font-medium text-trail">
              (encadrement uniquement)
            </span>
          </h2>
          <NoteForm jeuneId={jeuneId} pending={pending} onAdded={refresh} />
          {data.notes.length === 0 ? (
            <p className="text-sm text-trail">Aucune note.</p>
          ) : (
            <ul className="space-y-2">
              {data.notes.map((n) => (
                <li key={n.id} className="rounded-2xl bg-snow p-3 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap text-sm text-earth">{n.content}</p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteNote(n.id))}
                      className="shrink-0 p-1 text-brick hover:opacity-80"
                      aria-label="Supprimer la note"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-trail">
                    {n.author ? `${n.author.firstName} ${n.author.lastName}` : "—"} ·{" "}
                    {DATETIME_FMT.format(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function AwardBadge({
  badges,
  pending,
  onAward,
}: {
  jeuneId: string;
  badges: BadgeOption[];
  pending: boolean;
  onAward: (badgeId: string) => void;
}) {
  const [badgeId, setBadgeId] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <select
        value={badgeId}
        onChange={(e) => setBadgeId(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-earth"
      >
        <option value="">Attribuer un badge…</option>
        {badges.map((b) => (
          <option key={b.id} value={b.id}>
            {b.icon ?? "🏅"} {b.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={pending || !badgeId}
        onClick={() => {
          if (badgeId) onAward(badgeId);
          setBadgeId("");
        }}
      >
        <Plus className="size-4" />
        Attribuer
      </Button>
    </div>
  );
}

function GoalForm({
  jeuneId,
  steps,
  badges,
  pending,
  onCreated,
}: {
  jeuneId: string;
  steps: { id: string; name: string }[];
  badges: BadgeOption[];
  pending: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [target, setTarget] = useState("");
  const [busy, start] = useTransition();

  function submit() {
    let stepId = "";
    let badgeId = "";
    if (target.startsWith("step:")) stepId = target.slice(5);
    else if (target.startsWith("badge:")) badgeId = target.slice(6);
    start(async () => {
      const res = await setGoal(jeuneId, title, due, stepId, badgeId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Objectif ajouté.");
        setTitle("");
        setDue("");
        setTarget("");
        setOpen(false);
        onCreated();
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Définir un objectif
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-snow p-3 shadow-card">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Intitulé de l'objectif"
        className="h-9"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-earth"
        >
          <option value="">Cible (facultatif)</option>
          {steps.length > 0 ? (
            <optgroup label="Étapes">
              {steps.map((s) => (
                <option key={s.id} value={`step:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {badges.length > 0 ? (
            <optgroup label="Badges">
              {badges.map((b) => (
                <option key={b.id} value={`badge:${b.id}`}>
                  {b.icon ?? "🏅"} {b.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-9 w-40 appearance-none"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy || pending} onClick={submit}>
          Ajouter
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function NoteForm({
  jeuneId,
  pending,
  onAdded,
}: {
  jeuneId: string;
  pending: boolean;
  onAdded: () => void;
}) {
  const [content, setContent] = useState("");
  const [busy, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await addNote(jeuneId, content);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Note ajoutée.");
        setContent("");
        onAdded();
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder="Observation après une réunion / un week-end…"
      />
      <Button type="button" size="sm" disabled={busy || pending || !content.trim()} onClick={submit}>
        Ajouter la note
      </Button>
    </div>
  );
}
