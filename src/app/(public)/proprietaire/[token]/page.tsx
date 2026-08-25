import type { Metadata } from "next";

import { ORG_GROUP, ORG_NAME, ORG_PRIVACY_EMAIL } from "@/lib/legal/organization";
import {
  getOwnerConsentByToken,
  OWNER_CONSENT_LINK_TTL_DAYS,
} from "@/modules/camp/owner-consent";

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
//
// Le jeton SURVIT à la décision, et cette page rend alors une confirmation qui
// n'expose plus rien. C'est délibéré : une Server Action re-rend toujours la
// route courante, donc consommer le jeton affichait « lien expiré » dans la
// seconde suivant le clic — un message d'échec après une action réussie.
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
          Ce lien n&apos;est plus valable. Deux explications possibles : il a
          dépassé sa durée de validité de {OWNER_CONSENT_LINK_TTL_DAYS} jours,
          ou l&apos;adresse a été tronquée par votre logiciel de messagerie.
        </p>
        <p>
          Vos données n&apos;ont pas été supprimées pour autant, et elles
          restent invisibles dans l&apos;application tant que vous n&apos;avez
          pas répondu. Demandez au groupe de vous renvoyer un lien, ou écrivez
          directement à l&apos;adresse ci-dessous.
        </p>
        <p>
          Pour toute question sur vos données, écrivez à{" "}
          <strong>{ORG_PRIVACY_EMAIL}</strong>.
        </p>
      </article>
    );
  }

  // Après décision, le lien reste valable mais n'expose PLUS rien : ni les
  // coordonnées, ni le nom du lieu. Il devient une preuve consultable de ce qui
  // a été décidé, et cesse d'être un canal d'accès aux données.
  if (dossier.status !== "PENDING") {
    const accepte = dossier.status === "GRANTED";
    return (
      <article className="prose prose-sm max-w-none space-y-4 text-earth">
        <h1 className="text-3xl font-black text-forest">
          {accepte ? "Votre accord est enregistré" : "Vos coordonnées ont été effacées"}
        </h1>
        <p>
          {accepte
            ? "Vous avez autorisé le groupe à utiliser vos coordonnées pour organiser un camp."
            : "Vous avez demandé leur effacement : elles ont été supprimées de l'application."}
          {dossier.decidedAt
            ? ` Décision enregistrée le ${dossier.decidedAt.toLocaleDateString("fr-FR")}.`
            : null}
        </p>
        <p>
          Cette page n&apos;affiche plus vos données : elle ne sert désormais
          qu&apos;à vous rappeler ce qui a été décidé. Pour revenir sur ce choix
          ou poser une question, écrivez à <strong>{ORG_PRIVACY_EMAIL}</strong>.
        </p>
        <p className="text-sm text-trail">
          Le détail figure dans la{" "}
          <a
            href="/information-tiers"
            className="font-bold text-forest underline-offset-4 hover:underline"
          >
            notice d&apos;information
          </a>
          .
        </p>
      </article>
    );
  }

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
        <p className="text-sm text-trail">
          <strong>D&apos;où viennent-elles ?</strong>{" "}
          Elles ont été saisies par un responsable du groupe, à partir de ce que
          vous lui avez communiqué
          lors d&apos;un contact au sujet de ce lieu, ou de ce qu&apos;un autre
          groupe scout lui a transmis. Elles ne proviennent d&apos;aucun fichier
          acheté ni d&apos;aucune collecte automatisée.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="text-xl font-bold text-earth">Votre choix</h2>
        <p>
          Tant que vous n&apos;avez pas répondu, ces coordonnées restent{" "}
          <strong>invisibles</strong> dans l&apos;application : personne ne peut
          les consulter.
        </p>
        <OwnerDecisionForm token={token} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation du traitement et d&apos;opposition
          sur ces données. La base légale est l&apos;intérêt légitime du groupe
          à organiser ses activités. Le responsable du traitement est{" "}
          <strong>{ORG_NAME}</strong> ; pour exercer ces droits, écrivez à{" "}
          <strong>{ORG_PRIVACY_EMAIL}</strong>. Vous pouvez également saisir la
          CNIL (www.cnil.fr).
        </p>
        <p className="text-sm text-trail">
          Durée de conservation, personnes ayant accès et détail complet :{" "}
          <a
            href="/information-tiers"
            className="font-bold text-forest underline-offset-4 hover:underline"
          >
            notice d&apos;information
          </a>{" "}
          et{" "}
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
