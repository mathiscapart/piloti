import type { Metadata } from "next";

import { LEGAL_VERSION } from "@/lib/legal/versions";

export const metadata: Metadata = { title: "Mentions légales — Piloti" };

// RGPD-01 — mentions légales (LEGAL-01). Contenu factuel : dénomination,
// adresse, contact, hébergement, directeur de publication. Les placeholders
// [À COMPLÉTER : …] doivent être remplacés avant mise en production.
export default function MentionsLegalesPage() {
  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">Mentions légales</h1>
      <p className="text-sm text-trail">Dernière mise à jour : {LEGAL_VERSION}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Éditeur du site</h2>
        <p>
          Ce site est édité par le groupe local <strong>[À COMPLÉTER : dénomination
          officielle du groupe SGDF]</strong>, association affiliée à l&apos;association
          nationale des Scouts et Guides de France (reconnue d&apos;utilité publique).
        </p>
        <p>
          Adresse du siège : <strong>[À COMPLÉTER : adresse postale du groupe]</strong>
          <br />
          Contact : <strong>[À COMPLÉTER : email de contact du groupe]</strong>
        </p>
        <p>
          Directeur de la publication : <strong>[À COMPLÉTER : nom du responsable
          de groupe]</strong>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Hébergement</h2>
        <p>
          L&apos;application « Piloti » est hébergée par{" "}
          <strong>[À COMPLÉTER : nom et adresse de l&apos;hébergeur]</strong>. L&apos;accès
          se fait exclusivement via un tunnel chiffré Cloudflare, sans exposition
          directe du serveur sur Internet.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Développement</h2>
        <p>
          L&apos;application Piloti est un outil interne développé pour la gestion du
          matériel, des prêts, du planning et de la vie du groupe. Elle n&apos;a pas
          vocation commerciale.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Propriété intellectuelle</h2>
        <p>
          Le nom « Scouts et Guides de France », le logo et les éléments visuels
          associés sont la propriété de l&apos;association nationale. Toute
          reproduction en dehors du cadre du groupe est interdite sans
          autorisation.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Données personnelles</h2>
        <p>
          Le traitement des données personnelles des utilisateurs de Piloti est
          détaillé dans la{" "}
          <a href="/confidentialite" className="font-bold text-forest underline-offset-4 hover:underline">
            politique de confidentialité
          </a>
          .
        </p>
      </section>
    </article>
  );
}
