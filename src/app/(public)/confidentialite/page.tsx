import type { Metadata } from "next";

import { PRIVACY_VERSION } from "@/lib/legal/versions";

export const metadata: Metadata = { title: "Politique de confidentialité — Piloti" };

// RGPD-01 — politique de confidentialité (LEGAL-01). Rédigée pour l'usage réel
// de l'application (cf. src/lib/auth.ts, docker-compose.yml). Les placeholders
// [À COMPLÉTER : …] identifient les informations propres au groupe, à
// compléter avant mise en production.
export default function ConfidentialitePage() {
  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">Politique de confidentialité</h1>
      <p className="text-sm text-trail">Dernière mise à jour : {PRIVACY_VERSION}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Responsable de traitement</h2>
        <p>
          Le responsable du traitement des données personnelles collectées par
          l&apos;application Piloti est le groupe local{" "}
          <strong>[À COMPLÉTER : dénomination officielle du groupe SGDF]</strong>,
          représenté par son responsable de groupe.
        </p>
        <p>
          Pour toute question relative à vos données personnelles, ou pour
          exercer vos droits, contactez le référent RGPD du groupe :{" "}
          <strong>[À COMPLÉTER : email de contact RGPD du groupe]</strong>.
        </p>
        <p>
          Compte tenu de l&apos;échelle d&apos;un groupe local, la désignation d&apos;un
          délégué à la protection des données (DPO) au sens de l&apos;article 37
          du RGPD n&apos;est en principe pas requise ; le contact ci-dessus assure
          le rôle de référent pour l&apos;exercice de vos droits.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Finalités du traitement</h2>
        <p>
          Piloti est l&apos;outil interne de gestion du groupe scout. Les données
          collectées servent exclusivement aux finalités suivantes :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Gestion des comptes et de l&apos;annuaire des membres (jeunes, familles, chefs) ;</li>
          <li>Gestion du matériel : inventaire, prêts, retours, incidents ;</li>
          <li>Organisation du planning : événements, inscriptions, présences ;</li>
          <li>Suivi financier : cotisations, notes de frais, budget des événements ;</li>
          <li>Suivi pédagogique des jeunes : étapes de progression, badges, objectifs ;</li>
          <li>Communication interne : annonces, messagerie, notifications.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Bases légales</h2>
        <p>Selon les traitements, la base légale mobilisée est :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Le <strong>consentement</strong> de la personne (ou de son
            représentant légal si mineur de moins de 15 ans) pour la création
            du compte et l&apos;usage de l&apos;application ;
          </li>
          <li>
            L&apos;<strong>intérêt légitime</strong> de l&apos;association à organiser ses
            activités (planning, matériel, pédagogie, communication interne) ;
          </li>
          <li>
            L&apos;<strong>obligation légale</strong> de tenue d&apos;une comptabilité pour
            les données financières (cotisations, notes de frais).
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Durées de conservation</h2>
        <p>
          Les données d&apos;un compte sont conservées tant que la personne est
          membre active du groupe. À la suppression d&apos;un compte, celui-ci est
          désactivé et son email anonymisé (soft-delete) : les données liées à
          l&apos;historique du groupe (prêts, incidents, journal d&apos;audit, notes de
          frais) sont conservées pour la cohérence de cet historique et les
          obligations comptables, mais la personne ne peut plus se connecter et
          n&apos;est plus identifiable directement. Les données comptables sont
          conservées 10 ans conformément aux obligations légales.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Destinataires et sous-traitants</h2>
        <p>
          Les données ne sont jamais vendues ni transmises à des tiers à des
          fins commerciales. Elles sont accessibles uniquement aux
          responsables du groupe habilités, selon leur rôle dans
          l&apos;application. Certains traitements techniques sont sous-traités :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Resend</strong> — envoi des emails transactionnels (ex.
            réinitialisation de mot de passe) ;
          </li>
          <li>
            <strong>Cloudflare</strong> — tunnel sécurisé et protection réseau
            (CDN/WAF), sans exposition directe du serveur sur Internet ;
          </li>
          <li>
            <strong>[À COMPLÉTER : nom et localisation de l&apos;hébergeur]</strong> —
            hébergement du serveur applicatif et de la base de données.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Vos droits</h2>
        <p>Conformément au RGPD, vous disposez des droits suivants sur vos données :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Droit d&apos;accès à vos données ;</li>
          <li>Droit de rectification des données inexactes ;</li>
          <li>
            Droit à l&apos;effacement (« droit à l&apos;oubli »), mis en œuvre par une
            désactivation du compte et une anonymisation de l&apos;email ;
          </li>
          <li>Droit à la portabilité de vos données ;</li>
          <li>Droit d&apos;opposition, pour les traitements fondés sur l&apos;intérêt légitime.</li>
        </ul>
        <p>
          Pour exercer ces droits, contactez le référent RGPD du groupe :{" "}
          <strong>[À COMPLÉTER : email de contact RGPD du groupe]</strong>. Vous
          pouvez également introduire une réclamation auprès de la CNIL
          (www.cnil.fr) si vous estimez que vos droits ne sont pas respectés.
        </p>
      </section>
    </article>
  );
}
