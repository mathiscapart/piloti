"use client";

import { useMemo, useState } from "react";

import { Stars } from "@/components/camp/Stars";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UNIT_LABEL, UNITS, type Unit } from "@/lib/enums";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export interface ReviewListItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  author: { firstName: string; lastName: string; image: string | null } | null;
  event: { id: string; name: string; unit: string | null; year: number } | null;
}

const selectCls =
  "h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-earth";

// US-L07 — liste des avis filtrable par branche et par année du camp. Le
// filtrage est local : une fiche porte peu d'avis, inutile de repasser par le
// serveur. Les avis sans camp rattaché (dont tous ceux déposés avant US-L07)
// restent visibles tant qu'aucun filtre n'est posé.
export function ReviewList({ reviews }: { reviews: ReviewListItem[] }) {
  const [unit, setUnit] = useState("");
  const [year, setYear] = useState("");

  // Branches et années réellement présentes dans les avis — on ne propose pas
  // un filtre qui ne renverrait rien. Les branches suivent l'ordre SGDF.
  const units = useMemo(() => {
    const present = new Set(
      reviews.map((r) => r.event?.unit).filter((u): u is string => !!u),
    );
    return UNITS.filter((u) => present.has(u));
  }, [reviews]);

  const years = useMemo(
    () =>
      [
        ...new Set(
          reviews.map((r) => r.event?.year).filter((y): y is number => y != null),
        ),
      ].sort((a, b) => b - a),
    [reviews],
  );

  const shown = useMemo(() => {
    if (!unit && !year) return reviews;
    return reviews.filter(
      (r) =>
        r.event != null &&
        (!unit || r.event.unit === unit) &&
        (!year || String(r.event.year) === year),
    );
  }, [reviews, unit, year]);

  const filtered = Boolean(unit || year);

  return (
    <div className="space-y-3">
      {units.length > 0 || years.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {units.length > 0 ? (
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={selectCls}
              aria-label="Filtrer par branche"
            >
              <option value="">Toutes branches</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u as Unit]}
                </option>
              ))}
            </select>
          ) : null}
          {years.length > 0 ? (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={selectCls}
              aria-label="Filtrer par année"
            >
              <option value="">Toutes années</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          ) : null}
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setUnit("");
                setYear("");
              }}
              className="text-sm font-bold text-trail hover:text-earth"
            >
              Réinitialiser
            </button>
          ) : null}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-sm text-trail">
          {filtered
            ? "Aucun avis pour ce filtre."
            : "Aucun avis pour le moment. Dépose le premier après ton camp."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="space-y-1.5 rounded-2xl bg-snow p-4 shadow-card">
              <div className="flex items-center gap-2">
                {r.author ? (
                  <UserAvatar
                    image={r.author.image}
                    firstName={r.author.firstName}
                    lastName={r.author.lastName}
                    className="size-7"
                  />
                ) : null}
                <span className="text-sm font-bold text-earth">
                  {r.author ? `${r.author.firstName} ${r.author.lastName}` : "Chef"}
                </span>
                <Stars value={r.rating} size="size-3.5" className="ml-auto" />
              </div>
              {r.comment ? (
                <p className="whitespace-pre-wrap text-sm text-earth">{r.comment}</p>
              ) : null}
              <p className="text-xs text-trail">
                {DATE_FMT.format(r.createdAt)}
                {r.event
                  ? ` · ${r.event.name}${
                      r.event.unit
                        ? ` · ${UNIT_LABEL[r.event.unit as Unit] ?? r.event.unit}`
                        : ""
                    }`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
