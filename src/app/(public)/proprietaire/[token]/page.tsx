import type { Metadata } from "next";

import { ORG_GROUP, ORG_NAME, ORG_PRIVACY_EMAIL } from "@/lib/legal/organization";
import { getOwnerConsentByToken } from "@/modules/camp/owner-consent";

import { OwnerDecisionForm } from "./OwnerDecisionForm";

export const metadata: Metadata = {
  title: "Vos coordonnées — Piloti",
  // Une page qui affiche les données personnelles d'une personne identifiée
  // n'a rien à faire dans un index de moteur de recherche.
  robots: { index: false, follow: false },
};

// Le contenu dépend d'un jeton et de l'état en base : jamais de pré-rendu.
export const dynamic = "force-dynamic";

// RGPD-09 — page destinée au propriétaire d'un lieu de camp, qui n'est PAS
// utilisateur de l'application. Elle lui montre exactement ce qui est stocké
// sur lui et lui laisse deux choix. Aucune session n'est requise : c'est le
// jeton de l'URL qui autorise, et lui seul (cf. owner-consent-actions.ts).
export default async function ProprietairePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const dossier = await getOwnerConsentByToken(token);

  if (!dossier) {
    return (
      <article className="prose prose-sm max-w-none space-y-4 text-earth">
        <h1 className="text-3xl font-black text-forest">Lien expiré</h1>
        <p>
          Ce lien n&apos;est plus valable. C&apos;est le cas normal si vous avez
          déjà répondu : votre choix a été enregistré et le lien a été désactivé.
        </p>
        <p>
          Pour toute question sur vos données, écrivez à{" "}
          <strong>{ORG_PRIVACY_EMAIL}</strong>.
        </p>
      </article>
    );
  }

  const decided = dossier.status !== "PENDING";

  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">Vos coordonnées</h1>

      <section className="space-y-2">
        <p>
          Le groupe scout <strong>{ORG_GROUP}</strong> utilise une application
          interne pour organiser ses camps. Vous y êtes enregistré comme contact
          du lieu « <strong>{dossier.placeName}</strong> ».
        </p>
        <p>
          Vous n&apos;avez pas de compte et n&apos;avez rien à créer. Cette page
          existe pour que vous sachiez ce qui est conservé, et que vous puissiez
          en décider.
        </p>
      </section>

      <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="text-xl font-bold text-earth">Ce qui est enregistré</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nom : {dossier.ownerName ?? <em>non renseigné</em>}</li>
          <li>Téléphone : {dossier.ownerPhone ?? <em>non renseigné</em>}</li>
          <li>Email : {dossier.ownerEmail ?? <em>non renseigné</em>}</li>
        </ul>
        <p className="text-sm text-trail">
          Rien d&apos;autre. Ces données servent uniquement à joindre le
          propriétaire du lieu pour organiser un camp, et ne sont ni vendues, ni
          transmises à des tiers.
        </p>
      </section>

      {decided ? (
        <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="text-xl font-bold text-earth">Votre choix est enregistré</h2>
          <p>
            {dossier.status === "GRANTED"
              ? "Vous avez accepté que ces coordonnées soient utilisées par les responsables du groupe."
              : "Vous avez demandé l'effacement : vos coordonnées ont été supprimées de l'application."}
          </p>
          <p className="text-sm text-trail">
            Vous pouvez revenir sur ce choix à tout moment en écrivant à{" "}
            <strong>{ORG_PRIVACY_EMAIL}</strong>.
          </p>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="text-xl font-bold text-earth">Votre choix</h2>
          <p>
            Tant que vous n&apos;avez pas répondu, ces coordonnées restent
            <strong> invisibles</strong> dans l&apos;application : personne ne
            peut les consulter.
          </p>
          <OwnerDecisionForm token={token} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement et d&apos;opposition sur ces données. Le responsable
          du traitement est <strong>{ORG_NAME}</strong> ; pour exercer ces
          droits, écrivez à <strong>{ORG_PRIVACY_EMAIL}</strong>. Vous pouvez
          également saisir la CNIL (www.cnil.fr).
        </p>
        <p className="text-sm text-trail">
          Le détail des traitements figure dans la{" "}
          <a
            href="/confidentialite"
            className="font-bold text-forest underline-offset-4 hover:underline"
          >
            politique de confidentialité
          </a>
          .
        </p>
      </section>
    </article>
  );
}
