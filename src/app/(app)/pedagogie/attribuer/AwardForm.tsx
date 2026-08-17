"use client";

import { Award, Check, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { awardBadge } from "@/modules/pedagogy/progression-actions";

interface Jeune {
  id: string;
  firstName: string;
  lastName: string;
  image: string | null;
  unit: string | null;
}

interface Badge {
  id: string;
  name: string;
  icon: string | null;
  criteria: string | null;
  units: string[]; // [] = toutes branches
}

// US-S05 — attribution d'un badge à plusieurs jeunes, en deux temps : le badge,
// puis les jeunes. Trois informations que l'écran doit porter, sans quoi le chef
// travaille à l'aveugle :
//  - qui possède DÉJÀ le badge (`awardBadge` écarte les doublons en silence) ;
//  - à quoi le badge correspond (`criteria`) et quelles branches il concerne ;
//  - de quoi cocher une unité entière d'un geste, un badge se donnant souvent à
//    tout le monde après la même activité.
export function AwardForm({
  badges,
  jeunes,
  dejaAttribue,
}: {
  badges: Badge[];
  jeunes: Jeune[];
  dejaAttribue: Record<string, string[]>; // badgeId → userId[]
}) {
  const router = useRouter();
  const [badgeId, setBadgeId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const badge = useMemo(
    () => badges.find((b) => b.id === badgeId) ?? null,
    [badges, badgeId],
  );

  // Possesseurs actuels du badge choisi : ni cochables, ni comptés.
  const possede = useMemo(
    () => new Set(badgeId ? (dejaAttribue[badgeId] ?? []) : []),
    [dejaAttribue, badgeId],
  );

  // Le badge concerne-t-il cette branche ? `units` vide = toutes (cf. schéma).
  // Non bloquant : l'action l'autorise, on se contente de le signaler et de
  // l'exclure des sélections en masse.
  const concerne = (unit: string | null) =>
    !badge || badge.units.length === 0 || (unit !== null && badge.units.includes(unit));

  // Regroupement par branche, dans l'ordre du référentiel. Les jeunes sans
  // branche renseignée forment un groupe à part plutôt que de disparaître.
  const groupes = useMemo(() => {
    const parUnite = new Map<string | null, Jeune[]>();
    for (const j of jeunes) {
      const cle = j.unit && (UNITS as readonly string[]).includes(j.unit) ? j.unit : null;
      const liste = parUnite.get(cle);
      if (liste) liste.push(j);
      else parUnite.set(cle, [j]);
    }
    const ordre = [...UNITS.filter((u) => parUnite.has(u)), ...(parUnite.has(null) ? [null] : [])];
    return ordre.map((u) => ({
      unit: u as string | null,
      label: u ? UNIT_LABEL[u as Unit] : "Sans branche renseignée",
      membres: parUnite.get(u as string | null) ?? [],
    }));
  }, [jeunes]);

  // Sélection effective = ce qui partira vraiment, une fois les possesseurs
  // écartés. C'est ce nombre qu'on affiche, pour ne pas annoncer un total faux.
  const aAttribuer = useMemo(
    () => [...selected].filter((id) => !possede.has(id)),
    [selected, possede],
  );

  function toggle(id: string) {
    if (possede.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bascule de groupe : ne vise que les jeunes réellement attribuables — ni
  // possesseurs, ni hors des branches du badge.
  function toggleGroupe(membres: Jeune[]) {
    const cibles = membres.filter((j) => !possede.has(j.id) && concerne(j.unit));
    const tousCoches = cibles.length > 0 && cibles.every((j) => selected.has(j.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const j of cibles) {
        if (tousCoches) next.delete(j.id);
        else next.add(j.id);
      }
      return next;
    });
  }

  function submit() {
    start(async () => {
      const res = await awardBadge(badgeId, aAttribuer);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const n = aAttribuer.length;
      toast.success(
        `« ${badge?.name} » attribué à ${n} jeune${n > 1 ? "s" : ""}.`,
      );
      setSelected(new Set());
      router.refresh(); // recharge les possesseurs : les nouveaux passent en « déjà »
    });
  }

  if (badges.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="Aucun badge au catalogue"
        description="Crée d'abord un badge dans le référentiel pour pouvoir l'attribuer."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/pedagogie/referentiel">Ouvrir le référentiel</Link>
          </Button>
        }
      />
    );
  }

  if (jeunes.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Aucun jeune dans ta branche"
        description="Les comptes doivent être actifs et rattachés à une branche pour recevoir un badge."
      />
    );
  }

  const empeche = !badgeId
    ? "Choisis d'abord un badge."
    : aAttribuer.length === 0
      ? "Sélectionne au moins un jeune qui ne l'a pas déjà."
      : null;

  return (
    <div className="space-y-6">
      {/* ── 1. Le badge ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-trail">
          1. Quel badge ?
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {badges.map((b) => {
            const on = b.id === badgeId;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setBadgeId(on ? "" : b.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl p-3 text-left shadow-card transition-colors",
                    on ? "bg-forest-soft ring-2 ring-forest" : "bg-snow hover:bg-sand/60",
                  )}
                >
                  <span aria-hidden className="text-2xl leading-none">
                    {b.icon ?? "🏅"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-earth">
                      {b.name}
                    </span>
                    <span className="block truncate text-xs text-trail">
                      {b.units.length === 0
                        ? "Toutes branches"
                        : b.units.map((u) => UNIT_LABEL[u as Unit] ?? u).join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {badge?.criteria ? (
          <p className="rounded-2xl bg-sun-soft px-4 py-3 text-sm text-sun-ink">
            <span className="font-bold">Critère — </span>
            {badge.criteria}
          </p>
        ) : null}
      </section>

      {/* ── 2. Les jeunes ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-trail">
          2. À qui ?
        </h2>

        {groupes.map((g) => {
          const cibles = g.membres.filter(
            (j) => !possede.has(j.id) && concerne(j.unit),
          );
          const tousCoches =
            cibles.length > 0 && cibles.every((j) => selected.has(j.id));
          return (
            <div key={g.label} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                {/* Une seule branche : l'intitulé n'apprend rien, on l'omet. */}
                {groupes.length > 1 ? (
                  <h3 className="text-sm font-bold text-earth">{g.label}</h3>
                ) : (
                  <span className="text-sm text-trail">
                    {g.membres.length} jeune{g.membres.length > 1 ? "s" : ""}
                  </span>
                )}
                {cibles.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleGroupe(g.membres)}
                    className="text-xs font-bold text-forest hover:underline"
                  >
                    {tousCoches ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                ) : null}
              </div>

              <ul className="grid gap-2 sm:grid-cols-2">
                {g.membres.map((j) => {
                  const deja = possede.has(j.id);
                  const horsBranche = !concerne(j.unit);
                  const on = selected.has(j.id) && !deja;
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={deja}
                        onClick={() => toggle(j.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-2xl p-2 text-left shadow-card transition-colors",
                          deja
                            ? "cursor-not-allowed bg-sand/60 opacity-70"
                            : on
                              ? "bg-forest-soft ring-2 ring-forest"
                              : "bg-snow hover:bg-sand/60",
                        )}
                      >
                        <UserAvatar
                          image={j.image}
                          firstName={j.firstName}
                          lastName={j.lastName}
                          className="size-8"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-earth">
                            {j.firstName} {j.lastName}
                          </span>
                          {deja ? (
                            <span className="block text-xs font-bold text-forest-ink">
                              Déjà attribué
                            </span>
                          ) : horsBranche ? (
                            <span className="block truncate text-xs text-sun-ink">
                              Hors des branches du badge
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border",
                            on
                              ? "border-forest bg-forest text-snow"
                              : "border-stone",
                          )}
                        >
                          {on || deja ? (
                            <Check
                              className={cn(
                                "size-3.5",
                                deja && !on ? "text-forest-ink" : "",
                              )}
                            />
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ── Barre d'action ──────────────────────────────────────────────── */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-snow p-3 shadow-card">
        <span className="min-w-0 text-sm text-earth">
          {empeche ? (
            <span className="text-trail">{empeche}</span>
          ) : (
            <>
              <span className="font-bold">{aAttribuer.length}</span> jeune
              {aAttribuer.length > 1 ? "s" : ""} · {badge?.icon ?? "🏅"}{" "}
              <span className="font-bold">{badge?.name}</span>
            </>
          )}
        </span>
        <Button type="button" disabled={pending || empeche !== null} onClick={submit}>
          {pending ? "Attribution…" : "Attribuer le badge"}
        </Button>
      </div>
    </div>
  );
}
