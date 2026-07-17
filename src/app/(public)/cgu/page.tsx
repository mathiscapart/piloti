import type { Metadata } from "next";

import { TERMS_VERSION } from "@/lib/legal/versions";

export const metadata: Metadata = { title: "Conditions générales d'utilisation — Piloti" };

// RGPD-01 — conditions générales d'utilisation (LEGAL-01).
export default function CguPage() {
  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">Conditions générales d&apos;utilisation</h1>
      <p className="text-sm text-trail">Dernière mise à jour : {TERMS_VERSION}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Objet</h2>
        <p>
          Piloti est un outil interne de gestion réservé aux membres du groupe
          local <strong>[À COMPLÉTER : dénomination officielle du groupe SGDF]</strong>
          {" "}(jeunes, familles, chefs et responsables). Les présentes conditions
          définissent les règles d&apos;utilisation de l&apos;application.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Compte utilisateur</h2>
        <p>
          La création d&apos;un compte nécessite une validation par un
          administrateur du groupe. Chaque compte est personnel : l&apos;utilisateur
          s&apos;engage à ne pas communiquer ses identifiants et à signaler toute
          utilisation frauduleuse de son compte.
        </p>
        <p>
          Pour les mineurs de moins de 15 ans, la création d&apos;un compte est
          subordonnée à l&apos;autorisation d&apos;un responsable légal, recueillie lors
          de l&apos;inscription.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Usage de l&apos;application</h2>
        <p>
          L&apos;utilisateur s&apos;engage à utiliser Piloti dans le seul cadre des
          activités du groupe : gestion du matériel, organisation des
          événements, suivi pédagogique et communication interne. Tout usage
          détourné, tout contenu injurieux, discriminatoire ou contraire à la
          loi publié via la messagerie ou les annonces peut entraîner la
          suspension du compte par un administrateur.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Contenus et données</h2>
        <p>
          Les informations saisies (fiches matériel, notes de suivi
          pédagogique, messages, notes de frais…) restent la propriété du
          groupe et sont utilisées dans le cadre de sa gestion. Le traitement
          des données personnelles est décrit dans la{" "}
          <a href="/confidentialite" className="font-bold text-forest underline-offset-4 hover:underline">
            politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Disponibilité</h2>
        <p>
          Piloti est fourni « en l&apos;état », sans garantie de disponibilité
          continue. Le groupe s&apos;efforce d&apos;assurer un service fiable mais ne
          saurait être tenu responsable d&apos;une interruption temporaire.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Modification des CGU</h2>
        <p>
          Ces conditions peuvent être mises à jour ; la date de dernière mise
          à jour figure en haut de cette page. Les comptes existants ne sont
          pas invités à re-consentir rétroactivement à chaque évolution
          mineure du texte.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Contact</h2>
        <p>
          Pour toute question relative à ces conditions :{" "}
          <strong>[À COMPLÉTER : email de contact du groupe]</strong>.
        </p>
      </section>
    </article>
  );
}
