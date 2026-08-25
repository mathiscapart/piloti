// CONF-01 / LEGAL-02 — identité légale de l'instance déployée : éditeur,
// directeur de publication, contacts et hébergeur. Ces valeurs sont les seules
// informations des pages légales qui dépendent de QUI déploie Piloti, et non du
// logiciel lui-même. Elles vivent donc dans l'environnement, pas dans le code :
// un autre groupe SGDF doit pouvoir déployer l'application sans la forker ni
// éditer un fichier .tsx pour y mettre son nom (AGPL §13, cf. license.ts).
//
// ATTENTION — les trois pages qui consomment ce module DOIVENT rester en
// `dynamic = "force-dynamic"`. Elles étaient statiquement pré-rendues (`○` dans
// la sortie de `next build`) : Next.js aurait figé au build la valeur lue ici,
// c'est-à-dire le placeholder de l'étape `builder` du Dockerfile, et le `.env`
// de production n'aurait plus jamais eu d'effet sur la page publiée.

/**
 * Valeur de configuration légale, ou un placeholder visible si elle est absente.
 *
 * Une variable non renseignée ne doit jamais produire une page silencieusement
 * vide ou un « undefined » : c'est un document opposable. On rend donc le trou
 * visible et nommé, exactement comme les `[À COMPLÉTER : …]` qu'il remplace.
 * En production le problème ne se pose pas — `docker-compose.yml` refuse de
 * démarrer la stack si l'une de ces variables manque (`${VAR:?…}`), au même
 * titre que BETTER_AUTH_SECRET. Ce repli sert au développement local et aux
 * tests, où l'identité d'un vrai groupe n'a pas à être présente.
 */
function orgValue(raw: string | undefined, label: string): string {
  const value = raw?.trim();
  return value ? value : `[À COMPLÉTER : ${label}]`;
}

/**
 * Éditeur du site au sens de la LCEN : la personne — physique ou morale — qui
 * publie cette instance. Distinct de ORG_GROUP, et c'est tout l'objet de la
 * distinction : les Scouts et Guides de France ont une **personnalité morale
 * unique** (association déclarée, SIREN 775 682 024). Un groupe local n'est pas
 * une association et ne peut donc pas être éditeur ; selon les déploiements,
 * l'éditeur est soit l'association nationale, soit la personne qui héberge
 * l'instance pour son groupe. Un déploiement où les deux coïncident renseigne
 * simplement la même valeur dans les deux variables.
 */
export const ORG_NAME = orgValue(process.env.ORG_NAME, "éditeur du site");

/** Groupe local desservi par cette instance — l'usage, pas l'éditeur. */
export const ORG_GROUP = orgValue(process.env.ORG_GROUP, "dénomination du groupe SGDF desservi");

// Association nationale : identique pour tout déploiement SGDF, donc en dur
// plutôt qu'en configuration. Source : https://sgdf.fr/mentions-legales/
export const NATIONAL_ORG_NAME = "Association des Scouts et Guides de France";
export const NATIONAL_ORG_LEGAL = "association déclarée reconnue d'utilité publique, SIREN 775 682 024";
export const NATIONAL_ORG_ADDRESS = "21-37 rue de Stalingrad, 94110 Arcueil";

/** Adresse postale du siège de l'association (mention obligatoire, LCEN). */
export const ORG_ADDRESS = orgValue(process.env.ORG_ADDRESS, "adresse postale du groupe");

/** Contact général du groupe (CGU, mentions légales). */
export const ORG_EMAIL = orgValue(process.env.ORG_EMAIL, "email de contact du groupe");

/**
 * Contact du référent RGPD. Distinct de ORG_EMAIL à dessein : c'est l'adresse
 * par laquelle s'exercent les droits d'accès, de rectification et d'effacement,
 * et elle peut être relevée par une autre personne que le contact général.
 */
export const ORG_PRIVACY_EMAIL = orgValue(
  process.env.ORG_PRIVACY_EMAIL,
  "email de contact RGPD du groupe",
);

/** Directeur de la publication — en pratique le responsable de groupe (LCEN). */
export const ORG_PUBLICATION_DIRECTOR = orgValue(
  process.env.ORG_PUBLICATION_DIRECTOR,
  "nom du responsable de groupe",
);

/**
 * Hébergeur : nom et localisation. La LCEN impose de le désigner nommément, y
 * compris pour un auto-hébergement — dans ce cas c'est l'hébergeur de la
 * connexion et la localisation de la machine qu'on indique.
 */
export const ORG_HOSTING_PROVIDER = orgValue(
  process.env.ORG_HOSTING_PROVIDER,
  "nom et localisation de l'hébergeur",
);
