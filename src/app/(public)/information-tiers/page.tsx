import type { Metadata } from "next";

import { ORG_GROUP, ORG_NAME, ORG_PRIVACY_EMAIL } from "@/lib/legal/organization";
import { PRIVACY_VERSION } from "@/lib/legal/versions";

export const metadata: Metadata = { title: "Information — Piloti" };

// L'identité de l'instance est lue dans l'environnement au rendu (CONF-01) :
// cette page ne peut donc pas être pré-rendue statiquement.
export const dynamic = "force-dynamic";

// RGPD-09 (art. 14 RGPD) — notice destinée aux personnes dont les données sont
// enregistrées dans Piloti SANS qu'elles en soient utilisatrices : aujourd'hui,
// les propriétaires de lieux de camp. Le propriétaire qui a un email reçoit un
// lien personnalisé (`/proprietaire/<jeton>`) ; cette page-ci est la version
// générique, à transmettre quand on ne dispose que d'un numéro de téléphone.
export default function InformationTiersPage() {
  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">
        Information aux personnes extérieures au groupe
      </h1>
      <p className="text-sm text-trail">Dernière mise à jour : {PRIVACY_VERSION}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Pourquoi cette page</h2>
        <p>
          Le groupe scout <strong>{ORG_GROUP}</strong> utilise une application
          interne, Piloti, pour organiser ses activités. Certaines personnes y
          figurent sans en être utilisatrices : c&apos;est le cas des
          propriétaires de terrains et de bâtiments où le groupe campe.
        </p>
        <p>
          Vous ne pouvez donc pas vous connecter pour consulter ou corriger ces
          données. Cette page vous dit ce qui est conservé et comment agir.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Quelles données, et pourquoi</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Votre nom, votre téléphone et votre email, en tant que contact du lieu ;</li>
          <li>Rien d&apos;autre : aucune donnée bancaire, aucune information sur votre famille.</li>
        </ul>
        <p>
          <strong>D&apos;où viennent-elles ?</strong>{" "}
          Elles ont été saisies par un responsable du groupe, à partir de ce que
          vous lui avez communiqué lors
          d&apos;un contact au sujet du lieu, ou de ce qu&apos;un autre groupe
          scout lui a transmis. Elles ne proviennent d&apos;aucun fichier acheté
          ni d&apos;aucune collecte automatisée.
        </p>
        <p>
          Ces données servent uniquement à vous joindre pour organiser un camp.
          La base légale est l&apos;<strong>intérêt légitime</strong> du groupe à
          organiser ses activités. Elles ne sont ni vendues, ni transmises à des
          tiers, ni utilisées pour vous adresser des messages sans rapport.
        </p>
        <p>
          Le groupe vous demande par ailleurs votre accord avant de les rendre
          utilisables : tant que vous n&apos;avez pas répondu, elles restent
          enregistrées mais <strong>invisibles</strong>{" "}
          dans l&apos;application.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Qui y a accès</h2>
        <p>
          Seuls les responsables qui organisent effectivement un camp — chefs et
          responsable de groupe. Les autres membres de l&apos;encadrement voient
          la fiche du lieu (adresse, capacité, équipements) sans vos
          coordonnées.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Combien de temps</h2>
        <p>
          Tant que le lieu reste utile au groupe. Vos coordonnées sont effacées
          dès que vous le demandez, sans condition ni délai — le lieu lui-même
          (adresse, capacité) est conservé, mais plus rien ne vous y rattache.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation du traitement et d&apos;opposition.
          Le responsable du traitement est <strong>{ORG_NAME}</strong>. Pour exercer ces droits, une seule
          adresse suffit : <strong>{ORG_PRIVACY_EMAIL}</strong>.
        </p>
        <p>
          Vous pouvez également introduire une réclamation auprès de la CNIL
          (www.cnil.fr). Le détail des traitements figure dans la{" "}
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
