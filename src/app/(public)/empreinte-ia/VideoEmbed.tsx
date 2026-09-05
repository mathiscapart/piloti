"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/**
 * Lecteur YouTube à chargement différé.
 *
 * Tant que le visiteur n'a pas cliqué, RIEN n'est demandé à Google : ni script,
 * ni iframe, ni même la vignette (elle est servie par i.ytimg.com, donc elle
 * aussi traçante). L'aperçu est dessiné localement.
 *
 * Ce n'est pas un raffinement : cette page est publique et parle d'honnêteté
 * écologique. Y déposer des traceurs publicitaires avant tout consentement
 * serait se contredire dans le même écran — et sur une application qui gère des
 * données de mineurs, le consentement préalable n'est pas optionnel.
 *
 * `youtube-nocookie.com` doit rester autorisé en `frame-src` dans
 * `traefik/config/middlewares.yml`, sinon l'iframe est bloquée en prod
 * uniquement.
 */
export function VideoEmbed({
  id,
  titre,
  chaine,
}: {
  id: string;
  titre: string;
  chaine: string;
}) {
  const [charge, setCharge] = useState(false);

  if (charge) {
    return (
      <div className="aspect-video overflow-hidden rounded-2xl bg-earth shadow-card">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={titre}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setCharge(true)}
      // Le libellé accessible dit ce que le clic déclenche vraiment, y compris
      // la connexion à un tiers : c'est l'information qui permet de choisir.
      aria-label={`Lire la vidéo « ${titre} » de ${chaine} — charge le lecteur YouTube`}
      className="group flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-sky-soft to-sand p-6 text-center shadow-card transition-shadow hover:shadow-lg"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-snow/90 shadow-card transition-transform group-hover:scale-110">
        <Play className="size-6 translate-x-0.5 fill-sky-ink text-sky-ink" />
      </span>
      <span className="max-w-md">
        <span className="block text-base font-bold text-earth">{titre}</span>
        <span className="block text-sm text-trail">{chaine}</span>
      </span>
      <span className="text-xs text-trail">
        Cliquer charge le lecteur YouTube — rien n&apos;est envoyé à Google avant
      </span>
    </button>
  );
}
