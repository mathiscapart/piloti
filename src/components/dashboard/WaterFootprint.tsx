"use client";

import { ChevronDown, Droplets, Sparkles } from "lucide-react";
import { useState } from "react";

// Methodology:
// Mesuré sur les sessions de développement Claude Code de ce dépôt :
// ~160 prompts humains → ~3400 requêtes au modèle (chaque appel = 1 inférence).
// Base GPT-4 ≈ 5 ml/requête (Microsoft 2023 ≈ 0.5 L / 100 requêtes), MAIS le
// projet a surtout tourné sous Claude Opus 4.7 — modèle bien plus volumineux,
// avec de longs contextes agentiques (lectures de fichiers, longue conversation)
// → on retient ~3× la base, soit ~15 ml/requête (estimation, non publiée).
// 3400 × 15 ml = ~51 L ≈ 204 verres de 25 cl.
const PROMPTS = 160;
const INTERACTIONS = 3400;
const ML_PER_INTERACTION = 15;
const GLASS_ML = 250;
// La visualisation plafonne le nombre d'icônes affichées (le total réel reste
// indiqué en chiffres).
const MAX_GLASSES_SHOWN = 40;
const total_ml = INTERACTIONS * ML_PER_INTERACTION;
const glasses = Math.round(total_ml / GLASS_ML);
const liters = (total_ml / 1000).toFixed(1);

// Comparaisons en verres de 25 cl (1 verre = 0,25 L), choisies pour ENCADRER
// l'empreinte de l'appli (~51 L). Usages d'eau domestiques courants + le
// streaming vidéo (eau des data centers + production d'électricité : 2 à 12 L/h
// selon le MIT Energy Initiative ; estimation basse retenue → film 2 h ≈ 4 L).
const comparisons = [
  { label: "un bain (≈ 150 L)", glasses: 600 },
  { label: "une douche de 5 min (≈ 60 L)", glasses: 240 },
  { label: "un cycle de lave-linge (≈ 50 L)", glasses: 200 },
  { label: "une chasse d'eau (≈ 9 L)", glasses: 36 },
  { label: "regarder un film en streaming, 2 h (≈ 4 L)", glasses: 16 },
];

function Glass({ filled = true }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 32"
      className={`size-7 ${filled ? "text-sky" : "text-sky-soft"}`}
      aria-hidden="true"
    >
      {/* Glass outline */}
      <path
        d="M4 2 L20 2 L18 30 L6 30 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Water fill */}
      {filled && (
        <path
          d="M4.6 8 L19.4 8 L18 30 L6 30 Z"
          fill="currentColor"
          opacity="0.85"
        />
      )}
      {/* Shine */}
      {filled && (
        <path
          d="M7 12 L7.5 26"
          stroke="white"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />
      )}
    </svg>
  );
}

export function WaterFootprint() {
  const [open, setOpen] = useState(false);

  return (
    <section className="relative overflow-hidden rounded-3xl shadow-card">
      {/* Background gradient + decorative pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-soft via-snow to-sky-soft/50" />
      <svg
        className="absolute -right-8 -top-8 size-48 text-sky/10"
        viewBox="0 0 200 200"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="80" />
      </svg>
      <svg
        className="absolute -bottom-10 -left-6 size-40 text-sky/5"
        viewBox="0 0 200 200"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="80" />
      </svg>

      {/* Content */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-5 p-6 text-left"
          aria-expanded={open}
        >
          <div className="relative shrink-0">
            <div className="absolute inset-0 animate-pulse rounded-2xl bg-sky/20 blur-xl" />
            <div className="relative rounded-2xl bg-gradient-to-br from-sky to-sky-ink p-4 text-snow shadow-card">
              <Droplets className="size-7" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-sky-ink" />
              <p className="text-xs font-black uppercase tracking-widest text-sky-ink">
                Empreinte IA · Transparence
              </p>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-black leading-none text-sky-ink md:text-6xl">
                {glasses}
              </span>
              <span className="text-xl font-bold text-earth">
                verres d&apos;eau
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-trail">
              Pour construire cette application avec l&apos;IA
              <span className="text-trail/70">
                {" "}
                · {liters} L · {PROMPTS} prompts → {INTERACTIONS.toLocaleString("fr-FR")} requêtes IA
              </span>
            </p>
          </div>

          <div
            className={`shrink-0 rounded-full bg-snow/80 p-2 text-sky-ink shadow-card transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          >
            <ChevronDown className="size-4" />
          </div>
        </button>

        {/* Visualization — row of glasses */}
        <div className="relative px-6 pb-6">
          <div className="flex flex-wrap items-end gap-1.5 rounded-2xl bg-snow/70 p-4 backdrop-blur-sm">
            {Array.from({ length: Math.min(glasses, MAX_GLASSES_SHOWN) }).map(
              (_, i) => (
                <Glass key={i} filled />
              ),
            )}
            <span className="ml-2 text-xs font-bold text-sky-ink">
              {glasses > MAX_GLASSES_SHOWN ? "… " : ""}= {glasses} × 25 cl
            </span>
          </div>
        </div>

        {open && (
          <div className="relative space-y-5 border-t border-sky-soft/60 bg-snow/40 px-6 py-5 backdrop-blur-sm">
            <p className="text-sm leading-relaxed text-earth">
              Les centres de données qui font tourner l&apos;IA consomment de
              l&apos;eau pour <strong>refroidir leurs serveurs</strong>. Chaque
              échange avec l&apos;IA utilise environ{" "}
              <span className="rounded-md bg-sky-soft px-1.5 py-0.5 font-bold text-sky-ink">
                {ML_PER_INTERACTION} ml
              </span>{" "}
              d&apos;eau.
            </p>

            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-trail">
                À titre de comparaison
              </p>
              <ul className="space-y-2">
                {comparisons.map(({ label, glasses: g }) => {
                  const ratio = Math.min(100, (glasses / g) * 100);
                  return (
                    <li
                      key={label}
                      className="rounded-xl bg-snow p-3 shadow-card"
                    >
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-sm font-bold text-earth">
                          {label}
                        </span>
                        <span className="text-sm font-black text-sky-ink">
                          {g} verres
                        </span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-sky-soft/60">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky to-sky-ink"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-trail">
                        Cette appli = <strong>{ratio.toFixed(0)}%</strong> de
                        cet usage
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-forest to-forest/80 p-4 text-snow shadow-card">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-snow/20 p-2">
                  <Sparkles className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="font-black">
                    {glasses} verres pour une appli complète
                  </p>
                  <p className="mt-1 text-sm text-snow/90 leading-relaxed">
                    Sans IA : plusieurs <strong>semaines</strong> de
                    développement, autant de café, d&apos;électricité et de
                    trajets. L&apos;IA a permis de livrer Piloti rapidement, avec
                    une empreinte mesurable et assumée.
                  </p>
                </div>
              </div>
            </div>

            <details className="group">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-trail hover:text-earth">
                Méthodologie ↗
              </summary>
              <p className="mt-2 rounded-xl bg-snow/80 p-3 text-xs leading-relaxed text-trail">
                Mesuré sur les sessions de développement : {PROMPTS} prompts ont
                déclenché {INTERACTIONS.toLocaleString("fr-FR")} requêtes au
                modèle × {ML_PER_INTERACTION} ml = {liters} L ÷ {GLASS_ML} ml ={" "}
                <strong>{glasses} verres</strong> de {GLASS_ML} ml. La base GPT-4
                ≈ 5 ml/requête (Microsoft 2023, ≈ 0,5 L / 100 requêtes) est
                pondérée ×3 car le projet a surtout tourné sous{" "}
                <strong>Claude Opus 4.7</strong> (modèle plus volumineux, longs
                contextes) → ~15 ml/requête (estimation). Streaming : 2 à 12 L
                d&apos;eau par heure (MIT Energy Initiative) — estimation basse
                retenue pour le film.
              </p>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
