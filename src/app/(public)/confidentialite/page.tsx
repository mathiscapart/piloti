import type { Metadata } from "next";

import { MESSAGE_TEXT_RETENTION_YEARS, auditRetentionYears } from "@/lib/audit-retention";
import {
  ORG_GROUP,
  ORG_HOSTING_PROVIDER,
  ORG_NAME,
  ORG_PRIVACY_EMAIL,
} from "@/lib/legal/organization";
import { PRIVACY_VERSION, legalVersionDate } from "@/lib/legal/versions";

export const metadata: Metadata = { title: "Politique de confidentialité — Piloti" };

// Les valeurs d'identité légale sont lues dans l'environnement au rendu : cette
// page ne peut donc pas être pré-rendue statiquement, sinon `next build` figerait
// dans l'image le placeholder de l'étape `builder` du Dockerfile (cf.
// src/lib/legal/organization.ts).
export const dynamic = "force-dynamic";

// RGPD-01 — politique de confidentialité (LEGAL-01). Rédigée pour l'usage réel
// de l'application (cf. src/lib/auth.ts, docker-compose.yml). L'identité du
// groupe et de l'hébergeur vient de l'environnement (organization.ts).
export default function ConfidentialitePage() {
  // #163 — durée propre à l'instance (AUDIT_RETENTION_YEARS), lue au rendu.
  const auditYears = auditRetentionYears();
  return (
    <article className="prose prose-sm max-w-none space-y-6 text-earth">
      <h1 className="text-3xl font-black text-forest">Politique de confidentialité</h1>
      <p className="text-sm text-trail">Dernière mise à jour : {legalVersionDate(PRIVACY_VERSION)}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Responsable de traitement</h2>
        <p>
          Le responsable du traitement des données personnelles collectées par
          l&apos;application Piloti est <strong>{ORG_NAME}</strong>, qui édite et
          héberge cette instance pour les besoins du groupe{" "}
          <strong>{ORG_GROUP}</strong> et détermine seul les finalités et les
          moyens du traitement.
        </p>
        <p>
          Pour toute question relative à vos données personnelles, ou pour
          exercer vos droits, contactez le référent RGPD du groupe :{" "}
          <strong>{ORG_PRIVACY_EMAIL}</strong>.
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
            Le <strong>consentement</strong>{" "}
            de la personne — ou celui de son
            responsable légal lorsqu&apos;elle est mineure — pour la création du
            compte et l&apos;usage de l&apos;application ;
          </li>
          <li>
            L&apos;<strong>intérêt légitime</strong>{" "}
            de l&apos;association à organiser ses
            activités (planning, matériel, pédagogie, communication interne) ;
          </li>
          <li>
            L&apos;<strong>obligation légale</strong>{" "}
            de tenue d&apos;une comptabilité pour
            les données financières (cotisations, notes de frais).
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Données des mineurs</h2>
        <p>
          Un jeune de moins de 15 ans ne dispose d&apos;aucun compte : ses données
          sont saisies et consultées par son responsable légal ou par un
          encadrant du groupe, et l&apos;autorisation parentale est attachée à sa
          fiche de membre, non à une inscription qu&apos;il aurait faite lui-même.
        </p>
        <p>
          Entre 15 et 18 ans, le jeune peut disposer d&apos;un compte, sous réserve
          de l&apos;autorisation d&apos;un responsable légal conservée avec sa fiche.
          Cette autorisation est requise pour tout mineur, quel que soit son âge.
        </p>
        <p>
          Les échanges privés sont fermés aux moins de 15 ans ; au-delà et
          jusqu&apos;à leur majorité, ils restent limités aux encadrants de leur
          unité et à leurs responsables légaux.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Personnes extérieures au groupe</h2>
        <p>
          L&apos;application conserve les coordonnées de personnes qui n&apos;en
          sont pas utilisatrices : les propriétaires des terrains et bâtiments où
          le groupe campe (nom, téléphone, email). La base légale est
          l&apos;<strong>intérêt légitime</strong>{" "}
          du groupe à organiser ses
          activités — ces personnes n&apos;ont pas de compte et ne peuvent donc
          pas consentir par les voies habituelles.
        </p>
        <p>
          Elles en sont informées lors de l&apos;enregistrement et il leur est
          demandé de valider cette utilisation : tant qu&apos;elles n&apos;ont
          pas répondu, leurs coordonnées restent enregistrées mais invisibles
          dans l&apos;application. L&apos;accès est limité aux responsables qui
          organisent effectivement un camp, et l&apos;effacement est effectué
          sans condition à leur demande. Le détail figure sur la{" "}
          <a href="/information-tiers" className="font-bold text-forest underline-offset-4 hover:underline">
            notice qui leur est destinée
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Durées de conservation</h2>
        <p>
          Les données d&apos;un compte sont conservées tant que la personne est
          membre active du groupe. À la suppression d&apos;un compte, celui-ci est
          désactivé et ses données identifiantes anonymisées (soft-delete) : les
          données liées à
          l&apos;historique du groupe (prêts, incidents, journal d&apos;audit, notes de
          frais) sont conservées pour la cohérence de cet historique et les
          obligations comptables, mais la personne ne peut plus se connecter et
          n&apos;est plus identifiable directement. Les données comptables sont
          conservées 10 ans conformément aux obligations légales.
        </p>
        <p>
          Le contenu des messages que vous avez écrits (annonces, messagerie
          privée) est effacé lors de cette anonymisation et remplacé par une
          mention explicite, afin qu&apos;aucun élément vous identifiant ne
          subsiste dans un texte libre. Font exception les messages visés par un
          signalement, conservés en l&apos;état au titre de la protection des
          mineurs : la preuve d&apos;un dossier de modération doit survivre à
          l&apos;effacement de son auteur.
        </p>
        <p>
          Le journal d&apos;audit, qui conserve l&apos;auteur et la date des
          opérations de gestion du groupe, est conservé{" "}
          <strong>
            {auditYears} an{auditYears > 1 ? "s" : ""}
          </strong>
          . Ses entrées plus anciennes sont supprimées automatiquement.
        </p>
        <p>
          Quand un message de salon est modifié ou supprimé, son texte
          d&apos;origine est conservé dans le journal d&apos;audit, consultable
          par le responsable de groupe et l&apos;administrateur, au titre de la
          modération et de la protection des mineurs. Supprimer un message le
          retire donc des salons, mais pas immédiatement de ce journal. Ce
          texte en est retiré automatiquement au bout de{" "}
          <strong>
            {MESSAGE_TEXT_RETENTION_YEARS} an{MESSAGE_TEXT_RETENTION_YEARS > 1 ? "s" : ""}
          </strong>
          , ou plus tôt lors de l&apos;anonymisation du compte de son auteur ;
          seule reste la trace de l&apos;opération (qui, quoi, quand).
        </p>
        <p>
          Une demande d&apos;inscription refusée est conservée 30 jours (le
          temps d&apos;un recours ou d&apos;une nouvelle demande), puis
          anonymisée automatiquement selon les mêmes principes.
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
            réinitialisation de mot de passe) : adresse email et contenu du
            message. Les données sont hébergées dans l&apos;Union européenne
            (Irlande) ;
          </li>
          <li>
            <strong>Cloudflare</strong> — tunnel sécurisé et protection réseau
            (CDN/WAF), sans exposition directe du serveur sur Internet : le
            trafic transite par son réseau mondial, y compris aux États-Unis.
            Le chiffrement de la connexion s&apos;arrête chez Cloudflare, qui
            voit donc votre adresse IP, les requêtes et les contenus échangés
            avec l&apos;application ;
          </li>
          <li>
            <strong>Service de notification de votre navigateur</strong>{" "}
            (par exemple Google, Microsoft, Mozilla ou Apple) — acheminement des
            notifications push, uniquement si vous les activez sur un appareil,
            ce qui reste facultatif. Leur contenu est chiffré entre le serveur
            et votre appareil : ce service le transmet sans pouvoir le lire.
            Piloti conserve l&apos;adresse d&apos;abonnement fournie par le
            navigateur et les clés de chiffrement associées. Elles sont
            supprimées lorsque vous cliquez sur « Désactiver le push sur cet
            appareil », lorsque le service de notification signale que
            l&apos;abonnement n&apos;est plus valide, et lors de la suppression
            de votre compte. L&apos;interrupteur « Push (navigateur) » de vos
            préférences coupe les notifications courantes mais conserve
            l&apos;abonnement : les messages urgents du groupe et les alertes
            de sécurité de votre compte restent envoyés tant qu&apos;il existe ;
          </li>
          <li>
            <strong>{ORG_HOSTING_PROVIDER}</strong> —
            hébergement du serveur applicatif et de la base de données.
          </li>
        </ul>
        <p>
          Resend et Cloudflare sont des sociétés de droit américain. Les
          transferts de données vers les États-Unis — y compris un éventuel
          accès depuis ce pays à des données hébergées dans l&apos;Union
          européenne (support, maison mère) — sont encadrés par leur
          certification au <strong>Data Privacy Framework</strong>{" "}
          UE–États-Unis, reconnu par la décision d&apos;adéquation de la
          Commission européenne du 10 juillet 2023 ; leurs contrats de
          sous-traitance prévoient en outre les clauses contractuelles types de
          la Commission européenne. Les services de notification des
          navigateurs peuvent également être opérés hors de l&apos;Union
          européenne. C&apos;est votre navigateur, et non Piloti, qui choisit
          ce service : ces transferts ne font l&apos;objet d&apos;aucun
          encadrement particulier, la seule garantie étant le chiffrement de
          bout en bout du contenu des notifications.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Sécurité</h2>
        <p>
          Des mesures techniques et organisationnelles protègent vos données
          contre l&apos;accès non autorisé, la perte ou l&apos;altération :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            L&apos;application n&apos;est accessible que par une connexion
            chiffrée, et le serveur n&apos;est pas exposé directement sur
            Internet ;
          </li>
          <li>
            Chaque utilisateur n&apos;accède qu&apos;aux données nécessaires à
            son rôle dans le groupe ;
          </li>
          <li>Les mots de passe ne sont jamais conservés en clair ;</li>
          <li>Les tentatives de connexion répétées sont bloquées ;</li>
          <li>
            Les opérations de gestion du groupe (matériel, finances, planning,
            suivi pédagogique…) sont enregistrées dans un journal qui en
            conserve l&apos;auteur et la date ;
          </li>
          <li>
            Des protections du navigateur limitent l&apos;injection de contenu
            malveillant dans les pages ;
          </li>
          <li>Les sauvegardes de la base de données sont chiffrées.</li>
        </ul>
        <p>
          En cas de violation de données présentant un risque pour vos droits
          et libertés, <strong>{ORG_NAME}</strong>{" "}
          la notifie à la CNIL dans les 72 heures suivant sa découverte et, si
          le risque est élevé, en informe également les personnes concernées
          dans les meilleurs délais.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold text-earth">Vos droits</h2>
        <p>Conformément au RGPD, vous disposez des droits suivants sur vos données :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Droit d&apos;accès à vos données ;</li>
          <li>Droit de rectification des données inexactes ;</li>
          <li>
            Droit à l&apos;effacement (« droit à l&apos;oubli »), mis en œuvre par une
            désactivation du compte, l&apos;anonymisation de vos données
            identifiantes (email, nom, coordonnées) et l&apos;effacement du contenu
            de vos messages, sous réserve de l&apos;exception de modération décrite
            ci-dessus ;
          </li>
          <li>Droit à la portabilité de vos données ;</li>
          <li>Droit à la limitation du traitement ;</li>
          <li>Droit d&apos;opposition, pour les traitements fondés sur l&apos;intérêt légitime.</li>
        </ul>
        <p>
          Pour exercer ces droits, contactez le référent RGPD du groupe :{" "}
          <strong>{ORG_PRIVACY_EMAIL}</strong>. Vous
          pouvez également introduire une réclamation auprès de la CNIL
          (www.cnil.fr) si vous estimez que vos droits ne sont pas respectés.
        </p>
      </section>
    </article>
  );
}
