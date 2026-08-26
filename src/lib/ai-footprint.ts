// Empreinte eau de l'assistance IA utilisée pour développer Piloti.
//
// Ces constantes vivent ici, hors du composant, pour une raison : elles sont
// des DONNÉES, pas de la présentation. Les mesurer à nouveau ne doit demander
// de toucher qu'à ce fichier, et la page doit pouvoir afficher l'incertitude
// aussi clairement que la valeur.
//
// ─── Ce qui est mesuré ───────────────────────────────────────────────────────
// Comptage direct dans les transcrits de sessions Claude Code du poste de
// développement (`~/.claude/projects/*piloti*/*.jsonl`), en distinguant les
// prompts humains des retours d'outils — ces derniers relancent le modèle sans
// être des demandes.
//
// ─── Ce qui ne l'est pas ─────────────────────────────────────────────────────
// Les transcrits ne couvrent que du 2026-07-25 au 2026-08-26, alors que le
// dépôt démarre le 2026-05-14 : les deux premiers tiers du projet manquent, et
// c'était la phase de construction des modules. S'y ajoutent les sessions
// purgées par rotation, les autres outils éventuels, et les inférences internes
// (compactions de contexte, sous-agents) qui ne laissent pas de trace.
//
// D'où deux valeurs et non une : ce qui est prouvé, et ce qui est probable.

/** Prompts humains réellement comptés dans les transcrits disponibles. */
export const MEASURED_PROMPTS = 322;

/** Requêtes au modèle comptées sur la même période. */
export const MEASURED_REQUESTS = 5_630;

/** Période effectivement couverte par le comptage. */
export const MEASURED_FROM = "2026-07-25";
export const MEASURED_TO = "2026-08-26";
export const PROJECT_START = "2026-05-14";

/**
 * Estimation haute, extrapolée à la durée réelle du projet au rythme observé.
 * Volontairement présentée comme une extrapolation : la phase initiale était
 * probablement plus dense, donc ce nombre reste un ordre de grandeur.
 */
export const EXTRAPOLATED_REQUESTS = 22_000;

/**
 * Eau par requête, en millilitres — l'hypothèse la plus fragile de tout le
 * calcul, et de loin.
 *
 * Base publique : ~5 ml/requête pour GPT-4 (estimations 2023 à partir des
 * rapports environnementaux de Microsoft), pondérée ×3 pour un modèle plus
 * volumineux servi sur de longs contextes agentiques.
 *
 * MAIS des exploitants ont publié depuis des mesures d'un ordre de grandeur
 * INFÉRIEUR — autour de 0,3 ml par requête texte, refroidissement inclus. Les
 * méthodologies diffèrent (eau prélevée sur site seule, ou eau consommée pour
 * produire l'électricité en plus), les modèles et les centres de données aussi.
 *
 * On conserve l'hypothèse haute par prudence, et on affiche la fourchette.
 */
export const ML_PER_REQUEST = 15;
export const ML_PER_REQUEST_LOW = 0.3;

export const GLASS_ML = 250;

const litres = (requests: number, mlPerRequest: number) =>
  (requests * mlPerRequest) / 1000;

export const LITERS_MEASURED = litres(MEASURED_REQUESTS, ML_PER_REQUEST);
export const LITERS_EXTRAPOLATED = litres(EXTRAPOLATED_REQUESTS, ML_PER_REQUEST);
export const LITERS_LOW = litres(EXTRAPOLATED_REQUESTS, ML_PER_REQUEST_LOW);

export const glasses = (l: number) => Math.round((l * 1000) / GLASS_ML);

/**
 * Repères de comparaison — tous des usages domestiques DIRECTS.
 *
 * Ce choix est délibéré et coûte de l'effet : l'« eau virtuelle » d'un café
 * (~130 L) ou d'un kilo de bœuf (~15 000 L) rendrait l'application dérisoire.
 * Mais ces chiffres relèvent d'une autre méthode — pluie et irrigation sur un
 * cycle agricole — et non de l'eau prélevée pour refroidir un serveur. Les
 * mélanger produirait un graphique flatteur et faux.
 */
export const COMPARISONS = [
  { label: "Regarder un film en streaming (2 h)", liters: 4 },
  { label: "Une chasse d'eau", liters: 9 },
  { label: "Un cycle de lave-linge", liters: 50 },
  { label: "Une douche de 5 minutes", liters: 60 },
  { label: "Un bain", liters: 150 },
  { label: "L'eau domestique d'une personne, en une journée", liters: 148 },
  { label: "Une semaine de douches quotidiennes", liters: 420 },
] as const;
