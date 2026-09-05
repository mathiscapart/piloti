// Empreinte de l'assistance IA utilisée pour développer Piloti.
//
// Ces constantes vivent ici, hors du composant, parce qu'elles sont des
// DONNÉES et non de la présentation. Les recompter ne doit demander de toucher
// qu'à ce fichier, et la page doit pouvoir afficher l'incertitude aussi
// clairement que la valeur.
//
// ─── L'unité de compte : le token, pas la requête ────────────────────────────
// Les chiffres publics (« 0,3 ml par requête ») portent sur une requête de
// conversation : quelques centaines de tokens, une question, une réponse.
// Le développement assisté n'a rien à voir : une seule demande déclenche des
// dizaines d'allers-retours, chacun portant tout le contexte du projet. Compter
// des « requêtes » revient à compter des trajets sans distinguer le vélo du
// camion.
//
// On compte donc les tokens, relevés dans les transcrits de sessions du poste
// de développement (`~/.claude/projects/*piloti*/*.jsonl`), qui enregistrent
// l'usage réel renvoyé par l'API — pas une estimation.

/** Période effectivement couverte par les transcrits disponibles. */
export const MEASURED_FROM = "2026-07-25";
export const MEASURED_TO = "2026-09-04";
export const PROJECT_START = "2026-05-14";

/** Demandes formulées par un humain (hors retours d'outils). */
export const MEASURED_PROMPTS = 425;

/** Appels au modèle. Bien plus nombreux : une demande en déclenche plusieurs. */
export const MEASURED_REQUESTS = 3_562;

// ─── Tokens relevés, par nature ──────────────────────────────────────────────
// La distinction est essentielle : ces trois familles ne coûtent pas la même
// chose à calculer, et les confondre fausse tout.

/** Tokens d'entrée réellement calculés (prompt neuf + mise en cache). */
export const TOKENS_INPUT = 20_575_123;

/**
 * Tokens d'entrée RELUS depuis le cache.
 *
 * Ils écrasent tout le reste en volume — c'est la signature du développement
 * assisté, où le même contexte de projet est renvoyé à chaque tour. Mais un
 * token relu n'est pas recalculé : son coût est une fraction de celui d'un
 * token neuf. Les compter comme les autres multiplierait l'estimation ;
 * les ignorer la diviserait. Ni l'un ni l'autre.
 */
export const TOKENS_CACHE_READ = 971_691_136;

/** Tokens produits par le modèle. Les plus coûteux : un passage complet chacun. */
export const TOKENS_OUTPUT = 2_664_397;

export const TOKENS_TOTAL = TOKENS_INPUT + TOKENS_CACHE_READ + TOKENS_OUTPUT;

/**
 * Poids relatifs des trois familles, ramenés au token de sortie.
 *
 * Approximation assumée : on utilise les RATIOS DE PRIX pratiqués par le
 * fournisseur (sortie = 5 × entrée, cache relu = 0,1 × entrée) comme substitut
 * du coût de calcul. Le prix n'est pas l'énergie — il inclut des marges et des
 * choix commerciaux — mais il suit le même ordre de grandeur, et c'est la seule
 * pondération publique disponible. C'est l'hypothèse la plus discutable de ce
 * fichier après l'énergie par token.
 */
export const POIDS_OUTPUT = 1;
export const POIDS_INPUT = 0.2;
export const POIDS_CACHE = 0.02;

/** Volume ramené à une unité unique, pour pouvoir multiplier par une énergie. */
export const TOKENS_EQUIVALENTS =
  TOKENS_OUTPUT * POIDS_OUTPUT +
  TOKENS_INPUT * POIDS_INPUT +
  TOKENS_CACHE_READ * POIDS_CACHE;

/**
 * Énergie par token de sortie, en wattheures.
 *
 * Les mesures publiées en 2025 s'étalent de 1×10⁻⁴ à 2×10⁻³ Wh selon la taille
 * du modèle, le matériel et le regroupement des requêtes. On retient la valeur
 * médiane, et on affiche la fourchette : elle couvre un facteur vingt, ce qui
 * est l'incertitude dominante de toute cette page.
 */
export const WH_PAR_TOKEN_BAS = 0.0001;
export const WH_PAR_TOKEN = 0.0005;
export const WH_PAR_TOKEN_HAUT = 0.002;

/**
 * Eau par wattheure, en millilitres.
 *
 * DÉRIVÉE, non postulée : le rapport Google donne 0,26 ml et 0,24 Wh pour la
 * même requête médiane. Le rapport des deux vaut 1,08 ml/Wh, soit 1,08 L/kWh.
 * Passer par l'énergie plutôt que par la requête permet d'appliquer ce ratio à
 * un travail qui n'a rien d'une requête médiane.
 *
 * Périmètre hérité de la source : eau évaporée sur le site du centre de
 * données. N'inclut PAS l'eau des centrales qui produisent l'électricité.
 */
export const ML_EAU_PAR_WH = 0.26 / 0.24;

// ─── Résultats ───────────────────────────────────────────────────────────────

export const WH_MESURE = TOKENS_EQUIVALENTS * WH_PAR_TOKEN;
export const KWH_MESURE = WH_MESURE / 1000;
export const KWH_BAS = (TOKENS_EQUIVALENTS * WH_PAR_TOKEN_BAS) / 1000;
export const KWH_HAUT = (TOKENS_EQUIVALENTS * WH_PAR_TOKEN_HAUT) / 1000;

export const LITERS_MEASURED = (WH_MESURE * ML_EAU_PAR_WH) / 1000;
export const LITERS_LOW = (KWH_BAS * 1000 * ML_EAU_PAR_WH) / 1000;
export const LITERS_HIGH = (KWH_HAUT * 1000 * ML_EAU_PAR_WH) / 1000;

/**
 * Facteur d'extrapolation à la durée réelle du projet.
 *
 * Les transcrits couvrent 42 jours sur 114. On extrapole à rythme constant,
 * ce qui est probablement FAUX et sous-estime : la phase manquante était celle
 * de la construction des modules, plus dense que la maintenance actuelle.
 */
export const JOURS_MESURES = 42;
export const JOURS_PROJET = 114;
export const FACTEUR_EXTRAPOLATION = JOURS_PROJET / JOURS_MESURES;
export const LITERS_EXTRAPOLATED = LITERS_MEASURED * FACTEUR_EXTRAPOLATION;

export const GLASS_ML = 250;
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

/**
 * Vidéo de vulgarisation citée sur la page.
 *
 * Elle n'est PAS la source des chiffres — ceux-ci viennent des publications
 * listées dans SOURCES. Elle explique le malentendu de périmètre qui rend les
 * chiffres publics incomparables entre eux ; c'est à ce titre qu'elle est
 * recommandée, et la distinction mérite d'être tenue.
 */
export const VIDEO = {
  id: "Qddzc5iqP5U",
  titre: "Tout le monde se trompe sur l'eau consommée par l'IA",
  chaine: "Numerama",
  chaineUrl: "https://www.youtube.com/@numerama",
  url: "https://youtu.be/Qddzc5iqP5U",
} as const;

/**
 * Sources, chacune vérifiable directement.
 *
 * On cite les publications PRIMAIRES et non les articles qui les relaient : un
 * chiffre qui a traversé trois reprises a souvent perdu son périmètre de mesure
 * en route, et c'est exactement ce qui rend le sujet illisible.
 *
 * `critique: true` marque les sources qui CONTESTENT les chiffres retenus.
 * Elles sont là exprès : une page qui ne cite que ce qui l'arrange ne vaut pas
 * mieux que celles qu'elle prétend corriger.
 */
export const SOURCES = [
  {
    label:
      "Google — « Measuring the environmental impact of delivering AI at Google Scale » (août 2025)",
    url: "https://arxiv.org/abs/2508.15734",
    detail:
      "0,26 ml d'eau et 0,24 Wh par requête texte médiane sur Gemini, à partir de données de production. C'est le rapport des deux qui sert ici de ratio eau/énergie. Méthodologie publiée et détaillée.",
  },
  {
    label: "Sam Altman — « The Gentle Singularity » (OpenAI, juin 2025)",
    url: "https://blog.samaltman.com/the-gentle-singularity",
    detail:
      "Annonce 0,000085 gallon par requête, soit 0,32 ml. Cohérent avec le chiffre de Google, mais c'est une ligne dans un billet de blog, sans méthode attachée : on ne s'en sert pas comme base de calcul.",
  },
  {
    label: "« Advocating Energy-per-Token in LLM Inference » — EuroMLSys 2025",
    url: "https://euromlsys.eu/pdf/euromlsys25-27.pdf",
    detail:
      "Défend le token, et non la requête, comme unité de mesure de l'énergie d'inférence. C'est le raisonnement suivi ici. Les mesures publiées s'étalent de 1×10⁻⁴ à 2×10⁻³ Wh par token de sortie.",
  },
  {
    label:
      "Li, Yang, Islam, Ren — « Making AI Less Thirsty » (UC Riverside, 2023)",
    url: "https://arxiv.org/abs/2304.03271",
    detail:
      "L'étude à l'origine du chiffre de 500 ml par conversation. Périmètre plus large : elle ajoute l'eau évaporée par les centrales électriques. Ce n'est pas la même grandeur que celle mesurée ici.",
  },
  {
    label: "Wu, Hua, Ding — « Not All Water Consumption Is Equal » (2025)",
    url: "https://arxiv.org/abs/2506.22773",
    detail:
      "Propose de pondérer l'eau consommée par le stress hydrique local et la saison : un litre évaporé dans une région sèche ne pèse pas comme un litre ailleurs. C'est la limite principale du chiffre unique affiché ici.",
    critique: true,
  },
  {
    label:
      "The Register — « Google games numbers to make AI look less thirsty »",
    url: "https://www.theregister.com/2025/08/22/googles_gemini_water/",
    detail:
      "Reproche à Google d'exclure l'eau consommée hors site pour produire son électricité. Le reproche est fondé, et il s'applique directement au ratio retenu sur cette page.",
    critique: true,
  },
] as const;
