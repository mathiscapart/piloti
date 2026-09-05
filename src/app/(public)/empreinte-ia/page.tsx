import { Droplets, ExternalLink } from "lucide-react";
import type { Metadata } from "next";

import {
  COMPARISONS,
  glasses,
  JOURS_MESURES,
  JOURS_PROJET,
  KWH_BAS,
  KWH_HAUT,
  KWH_MESURE,
  LITERS_EXTRAPOLATED,
  LITERS_HIGH,
  LITERS_LOW,
  LITERS_MEASURED,
  MEASURED_FROM,
  MEASURED_PROMPTS,
  MEASURED_REQUESTS,
  MEASURED_TO,
  ML_EAU_PAR_WH,
  SOURCES,
  TOKENS_CACHE_READ,
  TOKENS_EQUIVALENTS,
  TOKENS_INPUT,
  TOKENS_OUTPUT,
  TOKENS_TOTAL,
  VIDEO,
  WH_PAR_TOKEN,
} from "@/lib/ai-footprint";

import { VideoEmbed } from "./VideoEmbed";

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
  // Référence = le chiffre mesuré, celui affiché en tête de page. Comparer
  // à l'extrapolation ferait dire aux barres autre chose que le titre.
  const ratio = (LITERS_MEASURED / liters) * 100;
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
            {l(LITERS_MEASURED)}
          </span>
          <span className="text-lg font-bold text-earth">
            d&apos;eau, soit {fr(glasses(LITERS_MEASURED))} verres — et{" "}
            {KWH_MESURE.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}{" "}
            kWh d&apos;électricité
          </span>
        </div>
        <p className="mt-3 text-sm text-trail">
          Sur les {JOURS_MESURES} jours <strong>réellement mesurés</strong>, à
          partir du décompte des tokens. L&apos;incertitude sur
          l&apos;énergie par token donne une fourchette de{" "}
          <strong>{l(LITERS_LOW)}</strong> à <strong>{l(LITERS_HIGH)}</strong>.
        </p>
        <p className="mt-2 text-sm text-trail">
          Étendu aux {JOURS_PROJET} jours du projet au même rythme :{" "}
          <strong>~{l(LITERS_EXTRAPOLATED)}</strong>. C&apos;est une
          extrapolation, pas une mesure — d&apos;où le chiffre mesuré en grand.
        </p>
      </div>

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

      <Section titre="Pourquoi les chiffres publics varient autant">
        <p>
          En cherchant l&apos;eau consommée par une requête d&apos;IA, on trouve
          des valeurs qui vont de quelques gouttes à un demi-litre. Cet écart
          n&apos;est pas une controverse scientifique : il vient de{" "}
          <strong>deux périmètres de mesure différents</strong>, presque toujours
          cités comme s&apos;ils étaient le même.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>L&apos;eau prélevée sur le site.</strong>{" "}
            Ce que le centre de
            données évapore pour refroidir ses serveurs. C&apos;est ce que
            publient les exploitants — 0,26 ml chez Google, 0,32 ml chez OpenAI
            pour une requête médiane — et c&apos;est le périmètre que compte
            cette page.
          </li>
          <li>
            <strong>L&apos;eau du site plus celle des centrales.</strong>{" "}
            Produire l&apos;électricité qui alimente le serveur évapore elle
            aussi de l&apos;eau, dans les tours de refroidissement des centrales.
            En l&apos;ajoutant, et en portant sur du matériel de 2022, on arrive
            aux ordres de grandeur bien plus élevés qui circulent le plus.
          </li>
        </ol>
        <p>
          Les deux sont défendables. Ce qui ne l&apos;est pas, c&apos;est de
          comparer un chiffre de la première famille à un chiffre de la seconde.
          Cette page retient la première, et le dit.
        </p>

        <p className="rounded-xl bg-sky-soft/50 p-3">
          <strong>Pour bien comprendre ce calcul, regardez cette vidéo.</strong>{" "}
          {VIDEO.chaine} y démonte le malentendu de périmètre décrit ci-dessus,
          montre d&apos;où vient le chiffre que tout le monde répète et pourquoi
          il ne dit pas ce qu&apos;on lui fait dire. C&apos;est la meilleure
          entrée en matière que nous connaissions sur le sujet, et elle explique
          en quelques minutes ce que cette page résume en un tableau.
        </p>
        <p className="text-sm text-trail">
          Une précision d&apos;honnêteté : les nombres retenus ici ne viennent pas
          d&apos;elle, mais des publications des exploitants listées plus bas.
          Elle donne la méthode de lecture, pas la mesure.
        </p>

        <VideoEmbed id={VIDEO.id} titre={VIDEO.titre} chaine={VIDEO.chaine} />

        <p className="text-xs text-trail">
          <a
            href={VIDEO.url}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-forest underline-offset-4 hover:underline"
          >
            {VIDEO.titre}
          </a>{" "}
          —{" "}
          <a
            href={VIDEO.chaineUrl}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            {VIDEO.chaine}
          </a>
        </p>
      </Section>

      <Section titre="Sur quoi on se base : le token, pas la requête">
        <p>
          Les chiffres publiés par les exploitants valent <strong>par
          requête</strong> — une question, une réponse, quelques centaines de
          tokens. Appliquer tels quels ces millilitres à du développement
          assisté serait une erreur de catégorie : ici, une seule demande
          déclenche des dizaines d&apos;allers-retours, et chacun renvoie tout
          le contexte du projet au modèle. C&apos;est compter des trajets sans
          distinguer le vélo du camion.
        </p>
        <p>
          On compte donc les <strong>tokens</strong>, relevés dans les
          transcrits de sessions — ce sont les compteurs d&apos;usage renvoyés
          par l&apos;API, pas une estimation. Du {MEASURED_FROM} au{" "}
          {MEASURED_TO} :
        </p>
        <ul className="space-y-2">
          <li className="rounded-xl bg-snow p-3 shadow-card">
            <strong className="text-earth">
              {fr(MEASURED_PROMPTS)} demandes humaines
            </strong>{" "}
            <span className="text-trail">
              ont déclenché {fr(MEASURED_REQUESTS)} appels au modèle, soit{" "}
              {(MEASURED_REQUESTS / MEASURED_PROMPTS).toFixed(0)} par demande.
            </span>
          </li>
          <li className="rounded-xl bg-snow p-3 shadow-card">
            <strong className="text-earth">
              {fr(TOKENS_OUTPUT)} tokens produits
            </strong>{" "}
            <span className="text-trail">
              par le modèle. Ce sont les plus coûteux : chacun demande un
              passage complet dans le réseau.
            </span>
          </li>
          <li className="rounded-xl bg-snow p-3 shadow-card">
            <strong className="text-earth">
              {fr(TOKENS_INPUT)} tokens d&apos;entrée
            </strong>{" "}
            <span className="text-trail">
              réellement calculés — le texte neuf envoyé au modèle.
            </span>
          </li>
          <li className="rounded-xl bg-sky-soft/40 p-3 shadow-card">
            <strong className="text-earth">
              {fr(TOKENS_CACHE_READ)} tokens relus depuis le cache
            </strong>{" "}
            <span className="text-trail">
              — soit{" "}
              <strong>
                {((TOKENS_CACHE_READ / TOKENS_TOTAL) * 100).toFixed(1)} %
              </strong>{" "}
              du total. C&apos;est la signature du développement assisté : le
              même contexte de projet repart à chaque tour. Mais un token relu
              n&apos;est pas recalculé, il coûte une fraction d&apos;un token
              neuf.
            </span>
          </li>
        </ul>
        <p>
          Ces trois familles ne pesant pas pareil, on les ramène à une unité
          commune en les pondérant par les tarifs du fournisseur — la seule
          pondération publique disponible. Cela donne{" "}
          <strong>{fr(Math.round(TOKENS_EQUIVALENTS))} équivalents-tokens de
          sortie</strong>, dont les trois quarts viennent malgré tout du cache,
          par le seul effet du volume.
        </p>
        <p>Deux multiplications suffisent ensuite :</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Vers l&apos;énergie.</strong> Les mesures publiées donnent{" "}
            {WH_PAR_TOKEN.toExponential(0).replace("e-4", "×10⁻⁴")} Wh par token
            de sortie (fourchette : un facteur vingt, cf. plus bas). D&apos;où{" "}
            <strong>
              {KWH_MESURE.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}{" "}
              kWh
            </strong>
            , entre {KWH_BAS.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}{" "}
            et {KWH_HAUT.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}.
          </li>
          <li>
            <strong>Vers l&apos;eau.</strong> Le rapport Google donne 0,26 ml et
            0,24 Wh pour la même requête : leur rapport vaut{" "}
            {ML_EAU_PAR_WH.toFixed(2).replace(".", ",")} ml par Wh. Ce ratio
            n&apos;est pas postulé, il est dérivé d&apos;une source unique et
            cohérente — c&apos;est ce qui permet de l&apos;appliquer à un travail
            qui n&apos;a rien d&apos;une requête médiane.
          </li>
        </ol>
        <p className="rounded-xl bg-sand/60 p-3 text-sm text-trail">
          L&apos;électricité est d&apos;ailleurs la grandeur la plus parlante des
          deux :{" "}
          <strong>
            {KWH_MESURE.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kWh
          </strong>
          , c&apos;est l&apos;ordre de grandeur de deux à trois cycles de
          lave-linge. L&apos;eau n&apos;en est qu&apos;une conséquence, via le
          refroidissement.
        </p>
      </Section>

      <Section titre="Ce que cette estimation ne sait pas">
        <p>
          Trois incertitudes, par ordre d&apos;importance décroissante. Aucune
          ne joue sur plus d&apos;un facteur deux ou trois.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>L&apos;énergie par token couvre un facteur vingt.</strong>{" "}
            De 1×10⁻⁴ à 2×10⁻³ Wh selon la taille du modèle, le matériel et le
            regroupement des requêtes. C&apos;est de loin l&apos;incertitude
            dominante : elle explique à elle seule l&apos;écart entre{" "}
            {l(LITERS_LOW)} et {l(LITERS_HIGH)}. S&apos;y ajoute le ratio
            eau/énergie, publié par une entreprise qui vend le service et que
            personne d&apos;indépendant n&apos;a vérifié — et qui exclut
            l&apos;eau des centrales électriques, ce que deux des sources citées
            plus bas contestent.
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

      <Section titre="Cette eau n'est pas détruite — et alors ?">
        <p>
          L&apos;objection est juste, et elle mérite mieux qu&apos;un haussement
          d&apos;épaules : <strong>l&apos;eau ne disparaît pas</strong>. Elle
          n&apos;est pas consommée au sens où l&apos;est un litre de pétrole.
          Elle change d&apos;état, part en vapeur, retombe en pluie. Le cycle se
          referme. C&apos;est exactement l&apos;argument qu&apos;on oppose,
          à raison, aux chiffres spectaculaires sur le refroidissement des
          centrales nucléaires.
        </p>
        <p>
          Sauf qu&apos;il faut alors distinguer deux choses que le mot « eau »
          confond :
        </p>
        <ul className="space-y-2">
          <li className="rounded-xl bg-snow p-3 shadow-card">
            <strong className="text-earth">Ce qui est prélevé</strong>{" "}
            <span className="text-trail">
              — puis rendu au milieu, un peu plus chaud. C&apos;est le cas d&apos;une
              centrale nucléaire en bord de fleuve : elle pompe des volumes
              énormes et les restitue presque intégralement. Là, ça boucle
              vraiment, et au même endroit.
            </span>
          </li>
          <li className="rounded-xl bg-sky-soft/40 p-3 shadow-card">
            <strong className="text-earth">Ce qui est évaporé</strong>{" "}
            <span className="text-trail">
              — et ne revient pas. C&apos;est le refroidissement évaporatif d&apos;un
              centre de données, et c&apos;est ce que comptent les chiffres de
              cette page. L&apos;eau part en vapeur : elle quitte la nappe, la
              rivière, le bassin versant.
            </span>
          </li>
        </ul>
        <p>
          D&apos;où la réponse honnête : <strong>oui, ça boucle — à
          l&apos;échelle de la planète</strong>. Cette vapeur retombera en pluie.
          Mais rien ne garantit qu&apos;elle retombe au-dessus du bassin
          qu&apos;on vient de ponctionner, ni dans un délai qui ait un sens pour
          lui. De l&apos;eau évaporée en Arizona et rendue en pluie sur
          l&apos;Atlantique n&apos;a rien rendu à l&apos;Arizona.
        </p>
        <p>
          Le parallèle avec le nucléaire est d&apos;ailleurs plus direct
          qu&apos;il n&apos;y paraît, parce que les deux s&apos;additionnent : une
          requête consomme de l&apos;électricité, et produire cette électricité
          évapore de l&apos;eau dans les tours de refroidissement des centrales.
          C&apos;est même toute la différence de périmètre entre les deux familles
          de chiffres évoquées plus haut — les exploitants comptent leurs
          serveurs, l&apos;étude universitaire y ajoute les centrales.
        </p>
        <p className="rounded-xl bg-fire-soft/50 p-3 text-sm">
          Ce qu&apos;il faut en retenir : <strong>un litre n&apos;a pas la même
          valeur partout</strong>. Le même volume évaporé compte peu dans une
          région humide et beaucoup dans une région en stress hydrique — des
          travaux proposent de pondérer l&apos;empreinte par ce stress local
          (dernière source ci-dessous). Nous ne pouvons pas le faire ici :{" "}
          <strong>
            nous ne savons pas où se trouvaient les serveurs qui ont traité ces{" "}
            {fr(TOKENS_TOTAL)} tokens
          </strong>
          . Le chiffre de cette page est donc un volume, jamais un impact. Autant
          l&apos;écrire.
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
        <p className="text-sm">
          Le calcul tient en quatre étapes, et chacune s&apos;appuie sur une
          source vérifiable.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            <strong>Comptage des tokens</strong> : compteurs d&apos;usage
            renvoyés par l&apos;API et enregistrés dans les sessions du poste de
            développement, du {MEASURED_FROM} au {MEASURED_TO}. Ce sont des
            relevés, pas des estimations.
          </li>
          <li>
            <strong>Pondération des trois familles de tokens</strong> (sortie,
            entrée, cache relu) par les tarifs du fournisseur, faute de
            pondération énergétique publique. C&apos;est une approximation, et
            elle est assumée comme telle.
          </li>
          <li>
            <strong>Énergie par token</strong> : 1×10⁻⁴ à 2×10⁻³ Wh selon les
            mesures publiées en 2025. C&apos;est l&apos;incertitude dominante de
            toute la page.
          </li>
          <li>
            <strong>Conversion en eau</strong> : ratio dérivé du rapport Google,
            qui donne 0,26 ml et 0,24 Wh pour la même requête. Périmètre limité
            à l&apos;eau évaporée sur le site du centre de données —{" "}
            <em>hors</em> eau des centrales électriques.
          </li>
          <li>
            <strong>Usages domestiques</strong> : ordres de grandeur courants
            pour un logement en France.
          </li>
          <li>
            Le calcul est entièrement lisible dans le code source, fichier{" "}
            <code className="rounded bg-snow px-1 py-0.5 text-xs">
              src/lib/ai-footprint.ts
            </code>{" "}
            — constantes, hypothèses et commentaires compris.
          </li>
        </ul>

        <p className="pt-2 text-sm">
          Les publications citées sont les sources <strong>primaires</strong>,
          jamais les articles qui les relaient : un chiffre qui a traversé trois
          reprises a souvent perdu son périmètre de mesure en route, et c&apos;est
          ce qui rend ce sujet illisible.
        </p>
        <ul className="space-y-2">
          {SOURCES.map((src) => (
            <li
              key={src.url}
              className={`rounded-xl p-3 shadow-card ${
                "critique" in src && src.critique ? "bg-fire-soft/40" : "bg-snow"
              }`}
            >
              <a
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1.5 text-sm font-bold text-forest underline-offset-4 hover:underline"
              >
                {src.label}
                <ExternalLink className="mt-0.5 size-3 shrink-0" />
              </a>
              <p className="mt-1 text-xs text-trail">{src.detail}</p>
              {"critique" in src && src.critique ? (
                <p className="mt-1 text-xs font-bold text-fire-ink">
                  Source qui conteste les chiffres retenus ici.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-trail">
          Les deux dernières sont là exprès : elles attaquent le chiffre que
          cette page retient. Une page qui ne cite que ce qui l&apos;arrange ne
          vaut pas mieux que celles qu&apos;elle prétend corriger.
        </p>
      </Section>
    </article>
  );
}
