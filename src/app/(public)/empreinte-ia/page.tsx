import { Droplets } from "lucide-react";
import type { Metadata } from "next";

import {
  COMPARISONS,
  EXTRAPOLATED_REQUESTS,
  glasses,
  LITERS_EXTRAPOLATED,
  LITERS_LOW,
  LITERS_MEASURED,
  MEASURED_FROM,
  MEASURED_PROMPTS,
  MEASURED_REQUESTS,
  MEASURED_TO,
  ML_PER_REQUEST,
  ML_PER_REQUEST_LOW,
  PROJECT_START,
} from "@/lib/ai-footprint";

export const metadata: Metadata = {
  title: "Empreinte écologique de l'IA — Piloti",
  description:
    "Ce que l'assistance par IA a coûté en eau pour développer Piloti, comment c'est estimé, et ce que cette estimation ne sait pas.",
};

const fr = (n: number) => n.toLocaleString("fr-FR");
const l = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} L`;

// Barre de comparaison. Le ratio est plafonné à 100 % pour l'affichage, mais le
// pourcentage réel reste écrit : à 330 L, plusieurs repères sont dépassés, et
// masquer ce dépassement reviendrait à faire dire au graphique le contraire de
// ce que disent les chiffres.
function Repere({ label, liters }: { label: string; liters: number }) {
  const ratio = (LITERS_EXTRAPOLATED / liters) * 100;
  return (
    <li className="rounded-xl bg-snow p-3 shadow-card">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-earth">{label}</span>
        <span className="text-sm text-trail">{l(liters)}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-sky-soft/60">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${
            ratio > 100 ? "bg-gradient-to-r from-fire to-brick" : "bg-gradient-to-r from-sky to-sky-ink"
          }`}
          style={{ width: `${Math.min(100, ratio)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-trail">
        Développer Piloti ={" "}
        <strong className={ratio > 100 ? "text-brick" : "text-sky-ink"}>
          {ratio >= 1000 ? `${Math.round(ratio / 100) * 100}` : Math.round(ratio)} %
        </strong>{" "}
        de cet usage
      </p>
    </li>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-earth">{titre}</h2>
      {children}
    </section>
  );
}

export default function EmpreinteIaPage() {
  return (
    <article className="prose prose-sm max-w-none space-y-8 text-earth">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Droplets className="size-4 text-sky-ink" />
          <p className="text-xs font-black uppercase tracking-widest text-sky-ink">
            Transparence
          </p>
        </div>
        <h1 className="text-3xl font-black text-forest">
          Ce que l&apos;IA a coûté en eau
        </h1>
        <p className="text-base text-trail">
          Piloti a été développé avec l&apos;aide d&apos;une intelligence
          artificielle. Les centres de données qui la font tourner consomment de
          l&apos;eau pour refroidir leurs serveurs. Cette page dit combien, avec
          quelle méthode, et surtout ce que ce chiffre ne sait pas.
        </p>
      </header>

      <div className="rounded-2xl bg-gradient-to-br from-sky-soft via-snow to-sky-soft/50 p-6 shadow-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-5xl font-black leading-none text-sky-ink">
            {l(LITERS_EXTRAPOLATED)}
          </span>
          <span className="text-lg font-bold text-earth">
            environ, soit {fr(glasses(LITERS_EXTRAPOLATED))}{" "}
            verres d&apos;eau
          </span>
        </div>
        <p className="mt-3 text-sm text-trail">
          Estimation haute, pour l&apos;ensemble du projet. La fourchette réelle
          va de <strong>{l(LITERS_LOW)}</strong> à{" "}
          <strong>{l(LITERS_EXTRAPOLATED)}</strong>{" "}
          selon la source retenue pour
          l&apos;eau consommée par requête — un écart d&apos;un facteur 50, que
          la suite de cette page explique plutôt qu&apos;elle ne le masque.
        </p>
      </div>

      <Section titre="Comment c'est calculé">
        <p>
          L&apos;assistant de développement enregistre chaque session sur le
          poste. On y compte deux choses distinctes : les <strong>demandes
          humaines</strong>, et les <strong>requêtes au modèle</strong> — bien
          plus nombreuses, parce qu&apos;une seule demande déclenche des
          lectures de fichiers, des exécutions de commandes et des
          vérifications, dont chaque retour relance le modèle.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>{fr(MEASURED_PROMPTS)} demandes</strong> ont produit{" "}
            <strong>{fr(MEASURED_REQUESTS)} requêtes</strong> — soit environ{" "}
            {(MEASURED_REQUESTS / MEASURED_PROMPTS).toFixed(0)} requêtes par
            demande.
          </li>
          <li>
            Ce comptage ne couvre que la période du {MEASURED_FROM} au{" "}
            {MEASURED_TO}, alors que le projet démarre le {PROJECT_START}.
          </li>
          <li>
            Extrapolé à la durée réelle au même rythme :{" "}
            <strong>~{fr(EXTRAPOLATED_REQUESTS)} requêtes</strong>.
          </li>
          <li>
            Multiplié par l&apos;eau consommée par requête, puis converti en
            verres de 25 cl.
          </li>
        </ul>
      </Section>

      <Section titre="Ce que cette estimation ne sait pas">
        <p>
          Trois incertitudes, par ordre d&apos;importance décroissante. La
          première pèse plus que les deux autres réunies.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>L&apos;eau par requête.</strong> On retient{" "}
            {`${ML_PER_REQUEST} ml`}, dérivés d&apos;estimations publiées en 2023 sur
            un modèle de génération précédente. Des exploitants ont publié depuis
            des mesures autour de {String(ML_PER_REQUEST_LOW).replace(".", ",")}{" "}
            ml — cinquante fois moins. Les méthodes diffèrent : certaines
            comptent seulement l&apos;eau prélevée sur le site, d&apos;autres y
            ajoutent celle consommée pour produire l&apos;électricité. Nous
            gardons l&apos;hypothèse haute par prudence.
          </li>
          <li>
            <strong>Les deux premiers tiers du projet ne sont pas mesurés.</strong>{" "}
            Les enregistrements disponibles commencent en juillet ; la phase de
            construction des modules, en mai et juin, n&apos;a pas laissé de
            trace exploitable. L&apos;extrapolation suppose un rythme constant,
            ce qui est probablement faux — cette phase était sans doute plus
            dense.
          </li>
          <li>
            <strong>Les requêtes invisibles.</strong> Résumés automatiques de
            conversation, agents secondaires : ils consomment sans apparaître
            dans le décompte.
          </li>
        </ol>
        <p className="rounded-xl bg-fire-soft/50 p-3 text-sm">
          Autrement dit : le chiffre affiché en haut de page est un{" "}
          <strong>ordre de grandeur assumé</strong>, pas une mesure. Nous
          préférons l&apos;écrire que laisser croire à une précision qui
          n&apos;existe pas.
        </p>
      </Section>

      <Section titre="À quoi ça correspond">
        <p>
          Tous les repères ci-dessous sont des <strong>usages domestiques
          directs</strong>, comparables à de l&apos;eau prélevée pour refroidir
          des serveurs.
        </p>
        <ul className="space-y-2">
          {COMPARISONS.map((c) => (
            <Repere key={c.label} label={c.label} liters={c.liters} />
          ))}
        </ul>
        <p className="text-xs text-trail">
          Nous n&apos;utilisons volontairement pas l&apos;« eau virtuelle » des
          aliments — un café à ~130 L, un kilo de bœuf à ~15 000 L. Ces chiffres
          rendraient l&apos;application dérisoire, mais ils mesurent la pluie et
          l&apos;irrigation d&apos;un cycle agricole, pas un prélèvement
          industriel. Les mélanger donnerait un graphique flatteur et faux.
        </p>
      </Section>

      <Section titre="Pourquoi utiliser l'IA quand même">
        <p>
          Piloti est développé bénévolement, par une personne, pour un groupe
          scout. Sans assistance, l&apos;application n&apos;aurait pas existé —
          l&apos;alternative n&apos;était pas « la même application sans IA »,
          mais des tableurs partagés, des fils de discussion et des feuilles
          papier.
        </p>
        <p>
          Cette comparaison a ses limites, et nous ne prétendrons pas
          qu&apos;elle démontre une économie. Personne n&apos;a mesuré
          l&apos;empreinte de la version qui n&apos;a pas été écrite. Ce que
          nous pouvons affirmer, en revanche, ce sont les choix techniques qui
          réduisent la consommation <em>de l&apos;application elle-même</em>,
          tous les jours et pour toute sa durée de vie.
        </p>
      </Section>

      <Section titre="Ce qui a été fait pour limiter l'empreinte">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Auto-hébergement sur une machine déjà allumée.</strong>{" "}
            Aucun serveur loué, aucune capacité réservée en permanence dans un
            centre de données. L&apos;application partage un ordinateur qui
            fonctionnerait de toute façon.
          </li>
          <li>
            <strong>Une base de données sans serveur.</strong> SQLite est un
            simple fichier : pas de processus supplémentaire à faire tourner en
            continu, pas de second conteneur, pas de mémoire réservée.
          </li>
          <li>
            <strong>Des pages générées à la demande, sans surcouche.</strong>{" "}
            Peu de JavaScript envoyé au navigateur, pas de bibliothèque de
            cartographie lourde, images optimisées. Ce qui n&apos;est pas
            téléchargé n&apos;est ni transporté ni calculé.
          </li>
          <li>
            <strong>Aucune tâche de fond inutile.</strong> Le contrôle des prêts
            en retard tourne toutes les six heures, pas toutes les minutes.
          </li>
          <li>
            <strong>Une durée de vie longue.</strong> Le code est publié sous
            licence libre AGPL : un autre groupe peut le réutiliser sans
            refaire développer la même chose, et sans reconsommer ce que ce
            développement a coûté.
          </li>
        </ul>
      </Section>

      <Section titre="Pourquoi publier ce chiffre">
        <p>
          Parce qu&apos;il est facile de ne pas le publier. L&apos;empreinte
          d&apos;un outil numérique est invisible pour ceux qui l&apos;utilisent :
          rien, dans l&apos;application, ne laisse deviner qu&apos;elle a
          consommé quoi que ce soit.
        </p>
        <p>
          Piloti sert un mouvement d&apos;éducation qui parle de sobriété et de
          respect de la nature aux jeunes qu&apos;il accueille. Afficher ce que
          l&apos;outil a coûté, avec ses incertitudes plutôt qu&apos;avec un
          chiffre rassurant, nous a paru plus cohérent que de n&apos;en rien
          dire.
        </p>
      </Section>

      <Section titre="Sources et méthode">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            Comptage des requêtes : enregistrements de sessions du poste de
            développement, du {MEASURED_FROM} au {MEASURED_TO}.
          </li>
          <li>
            Eau par requête, hypothèse haute : estimations 2023 dérivées des
            rapports environnementaux d&apos;exploitants de centres de données.
          </li>
          <li>
            Eau par requête, hypothèse basse : mesures publiées par des
            exploitants en 2025, refroidissement et production électrique
            inclus.
          </li>
          <li>
            Usages domestiques : ordres de grandeur courants pour un logement en
            France.
          </li>
          <li>
            Le calcul est entièrement lisible dans le code source, fichier{" "}
            <code className="rounded bg-snow px-1 py-0.5 text-xs">
              src/lib/ai-footprint.ts
            </code>{" "}
            — constantes, hypothèses et commentaires compris.
          </li>
        </ul>
      </Section>
    </article>
  );
}
