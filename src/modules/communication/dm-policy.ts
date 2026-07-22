import { MAJORITY_AGE, DIRECT_MESSAGE_MIN_AGE, computeAge } from "@/lib/legal/age";
import { effectiveRoles } from "@/lib/permissions";

// SAFE-01 — protection des mineurs dans la messagerie privée. Module pur (pas
// d'accès base) : dm-queries.ts charge les participants (rôles, unité, date de
// naissance) et le lien familial, puis délègue la décision ici. Les trois
// points d'entrée de la messagerie (envoi, annuaire, fil de discussion)
// s'appuient tous sur `evaluateDmPolicy` — aucune règle d'âge dupliquée.
//
// Règle (décidée par le responsable de groupe) :
//   - moins de 15 ans : aucun échange privé, ni émis ni reçu ;
//   - 15-17 ans : échanges privés uniquement avec les chefs de son unité ;
//   - adultes (18+) entre eux : libre ;
//   - lien familial (FamilyLink, double sens) : toujours autorisé, quel que
//     soit l'âge.
// ADMIN a un passe-droit : c'est le superutilisateur de l'instance (cohérent
// avec `can()` dans permissions.ts, où ADMIN autorise tout). Il peut échanger en
// privé avec n'importe quel membre, et tout membre peut le joindre.

export interface DmParticipant {
  // Rôles fonctionnels (US-32) — source unique de la décision, lue via
  // `effectiveRoles`. Le champ `role` (miroir d'affichage) n'entre pas ici.
  roles?: string[] | string | null;
  unit?: string | null;
  birthDate?: Date | string | null;
}

export interface DmVerdict {
  allowed: boolean;
  // Message français adressé à l'utilisateur qui a tenté l'action. Absent si
  // `allowed` est `true`.
  reason?: string;
}

type AgeCategory = "UNKNOWN" | "CHILD" | "TEEN" | "ADULT";

// Fail-safe : une date de naissance absente ou invalide ne classe JAMAIS
// quelqu'un adulte (`computeAge` renvoie `null` dans ce cas).
function categorize(birthDate: DmParticipant["birthDate"]): AgeCategory {
  const age = computeAge(birthDate);
  if (age === null) return "UNKNOWN";
  if (age < DIRECT_MESSAGE_MIN_AGE) return "CHILD";
  if (age < MAJORITY_AGE) return "TEEN";
  return "ADULT";
}

// SAFE-01 — « chef de son unité » : rôle CHEF ET même unité que le jeune.
// `unit` est nullable en base (et parfois incohérent avec `role`) : fail-safe,
// une unité manquante d'un côté ou de l'autre bloque l'accès (cf. rapport).
function isUnitChiefOf(adult: DmParticipant, teen: DmParticipant): boolean {
  if (!adult.unit || !teen.unit) return false;
  return effectiveRoles(adult).includes("CHEF") && adult.unit === teen.unit;
}

// SAFE-01 — superutilisateur de l'instance : passe-droit de messagerie.
function isAdmin(p: DmParticipant): boolean {
  return effectiveRoles(p).includes("ADMIN");
}

export function evaluateDmPolicy(
  me: DmParticipant,
  other: DmParticipant,
  familyLinked: boolean,
): DmVerdict {
  // Lien familial : toujours autorisé, quel que soit l'âge — court-circuite
  // tout le reste.
  if (familyLinked) return { allowed: true };

  // ADMIN : passe-droit, dans un sens comme dans l'autre. Superutilisateur de
  // l'instance (cf. `can()`), il peut joindre n'importe quel membre et être
  // joint par lui — avant même le contrôle d'âge.
  if (isAdmin(me) || isAdmin(other)) return { allowed: true };

  const meCat = categorize(me.birthDate);
  const otherCat = categorize(other.birthDate);

  // Profil incomplet ≠ protection des mineurs : les comptes existants sans
  // date de naissance ne doivent pas recevoir un refus qu'ils ne comprennent
  // pas. Fail-safe : on bloque quand même (isMinor(null) === true), mais avec
  // un message actionnable.
  if (meCat === "UNKNOWN") {
    return {
      allowed: false,
      reason:
        "Complétez votre date de naissance dans votre profil pour utiliser la messagerie privée.",
    };
  }
  if (otherCat === "UNKNOWN") {
    return {
      allowed: false,
      reason:
        "Ce compte n'a pas encore complété son profil (date de naissance manquante) : la messagerie privée avec lui est indisponible.",
    };
  }

  // Adultes entre eux : libre.
  if (meCat === "ADULT" && otherCat === "ADULT") {
    return { allowed: true };
  }

  // Moins de 15 ans : aucun échange privé, dans aucun sens.
  if (meCat === "CHILD" || otherCat === "CHILD") {
    if (meCat === "CHILD") {
      return {
        allowed: false,
        reason:
          "Vous avez moins de 15 ans : la messagerie privée ne vous est pas accessible. Utilisez les salons collectifs du groupe.",
      };
    }
    return {
      allowed: false,
      reason:
        "Ce jeune a moins de 15 ans : la protection des mineurs interdit tout échange privé avec lui.",
    };
  }

  // 15-17 ans entre eux : pas d'échange privé (seulement avec les chefs de
  // leur unité, ou un lien familial déjà traité plus haut).
  if (meCat === "TEEN" && otherCat === "TEEN") {
    return {
      allowed: false,
      reason:
        "Les échanges privés entre jeunes de 15 à 17 ans ne sont pas autorisés. Utilisez les salons collectifs du groupe.",
    };
  }

  // Un 15-17 ans + un adulte : autorisé seulement si l'adulte est chef de
  // l'unité du jeune.
  const teen = meCat === "TEEN" ? me : other;
  const adult = meCat === "TEEN" ? other : me;
  if (isUnitChiefOf(adult, teen)) {
    return { allowed: true };
  }
  if (meCat === "TEEN") {
    return {
      allowed: false,
      reason:
        "Entre 15 et 17 ans, vous ne pouvez échanger en privé qu'avec les chefs de votre unité (ou vos responsables légaux).",
    };
  }
  return {
    allowed: false,
    reason:
      "La protection des mineurs limite la messagerie privée avec ce jeune (15-17 ans) aux chefs de son unité.",
  };
}
