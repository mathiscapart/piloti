import type { Metadata } from "next";

import {
  COPYRIGHT_HOLDER,
  COPYRIGHT_YEAR,
  LICENSE_NAME,
  LICENSE_URL,
  SOURCE_URL,
} from "@/lib/legal/license";
import {
  NATIONAL_ORG_ADDRESS,
  NATIONAL_ORG_LEGAL,
  NATIONAL_ORG_NAME,
  ORG_ADDRESS,
  ORG_EMAIL,
  ORG_GROUP,
  ORG_HOSTING_PROVIDER,
  ORG_NAME,
  ORG_PUBLICATION_DIRECTOR,
} from "@/lib/legal/organization";
import { LEGAL_VERSION } from "@/lib/legal/versions";

export const metadata: Metadata = { title: "Mentions légales — Piloti" };

// Les valeurs d'identité légale sont lues dans l'environnement au rendu : cette
// page ne peut donc pas être pré-rendue statiquement, sinon `next build` figerait
// dans l'image le placeholder de l'étape `builder` du Dockerfile (cf.
// src/lib/legal/organization.ts).
export const dynamic = "force-dynamic";

// RGPD-01 — mentions légales (LEGAL-01). Contenu factuel : dénomination,
// adresse, contact, hébergement, directeur de publication — toutes obligatoires
// (LCEN art. 6-III) et toutes propres à l'instance, donc lues dans
// l'environnement (organization.ts).
export default function MentionsLegalesPage() {
  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">Mentions légales</h1>
      <p className="text-sm text-trail">Dernière mise à jour : {LEGAL_VERSION}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Éditeur du site</h2>
        <p>
          Ce site est édité par <strong>{ORG_NAME}</strong>, à titre non
          commercial, pour les besoins du groupe <strong>{ORG_GROUP}</strong>.
        </p>
        <p>
          Ce groupe est un groupe local de l&apos;{NATIONAL_ORG_NAME} ({NATIONAL_ORG_LEGAL}),
          dont le siège est situé {NATIONAL_ORG_ADDRESS}. L&apos;association dispose d&apos;une
          personnalité morale unique : le groupe local n&apos;est pas une association
          distincte, et l&apos;association nationale n&apos;est pas l&apos;éditeur du présent site.
        </p>
        <p>
          Adresse du siège : <strong>{ORG_ADDRESS}</strong>
          <br />
          Contact : <strong>{ORG_EMAIL}</strong>
        </p>
        <p>
          Directeur de la publication : <strong>{ORG_PUBLICATION_DIRECTOR}</strong>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Hébergement</h2>
        <p>
          L&apos;application « Piloti » est hébergée par{" "}
          <strong>{ORG_HOSTING_PROVIDER}</strong>. L&apos;accès
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
        <h2 className="text-xl font-bold text-earth">Licence et code source</h2>
        <p>
          Piloti est un logiciel libre publié sous licence{" "}
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-forest underline-offset-4 hover:underline"
          >
            {LICENSE_NAME}
          </a>
          . Copyright © {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}.
        </p>
        <p>
          Conformément à l&apos;article 13 de cette licence, le code source de la
          version déployée ici est accessible à toute personne qui utilise
          l&apos;application :{" "}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-forest underline-offset-4 hover:underline"
          >
            {SOURCE_URL}
          </a>
          .
        </p>
        <p>
          Cette licence porte sur le code de l&apos;application. Elle ne confère
          aucun droit sur les marques, dénominations et éléments visuels
          mentionnés ci-dessus.
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
