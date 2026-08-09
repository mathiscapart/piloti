"use server";

import { unlink } from "fs/promises";
import { join } from "path";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { anonymizeUserInTx } from "@/lib/anonymize";
import { auth } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { birthDateSchema } from "@/lib/legal/age";
import { PRIVACY_VERSION } from "@/lib/legal/versions";
import { passwordSchema } from "@/lib/password-policy";
import { can, canAssignRole, type Action } from "@/lib/permissions";
import { NO_LOGIN_UNITS, ROLES, UNITS } from "@/lib/enums";

import type { ActionResult } from "@/lib/types";

const approveSchema = z.object({
  userId: z.string().min(1),
  roles: z.array(z.enum(ROLES)).min(1, "Attribue au moins un rôle."),
  // US-32 — la branche est attribuée à la validation ("" = aucune).
  unit: z
    .union([z.enum(UNITS), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
});

const rejectSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(1, "Indique une raison."),
});

// US-32 — rôles unifiés : un seul ensemble de rôles par compte (tout le catalogue).
const rolesSchema = z.object({
  userId: z.string().min(1),
  roles: z.array(z.enum(ROLES)).default([]),
});

// US-32 — édition de la branche/unité d'un membre (ADMIN + SECRÉTAIRE).
// "" = aucune unité (on stocke null).
const unitSchema = z.object({
  userId: z.string().min(1),
  unit: z
    .union([z.enum(UNITS), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
});

// SAFE-01 — correction d'une date de naissance déjà posée. C'est le seul
// chemin qui reste : l'intéressé ne peut que la renseigner une fois
// (`completeBirthDate`), jamais la réécrire.
const birthDateAdminSchema = z.object({
  userId: z.string().min(1),
  birthDate: birthDateSchema,
});

// US-26 — profil parent enrichi (annuaire des compétences).
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));
const memberProfileSchema = z.object({
  userId: z.string().min(1),
  profession: optionalText,
  skills: optionalText,
  availability: optionalText,
  helpNotes: optionalText,
  skillsConsent: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean(),
  ),
});

const userIdSchema = z.object({
  userId: z.string().min(1),
});

// US-CM-01 — création d'un compte enfant (Farfadets/Louveteaux) sans
// connexion propre, avec attestation de consentement parental reçue hors
// ligne (formulaire papier existant, non tracé jusqu'ici pour ce flux).
const childAccountSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis."),
  lastName: z.string().trim().min(1, "Nom requis."),
  unit: z.enum(NO_LOGIN_UNITS, "Branche invalide : Farfadets ou Louveteaux uniquement."),
  birthDate: birthDateSchema,
  // US-CM-01 (correctif PO) — sélectionné parmi les comptes PARENT existants,
  // jamais saisi en texte libre : élimine les fautes de frappe sur un
  // enregistrement légal. Vérifié en base dans la transaction ci-dessous.
  guardianUserId: z.string().trim().min(1, "Le responsable légal est requis."),
  attestationDate: z.coerce
    .date("Date de l'attestation invalide.")
    .min(new Date("1900-01-01"), "Date de l'attestation invalide.")
    .max(new Date(), "La date de l'attestation ne peut pas être dans le futur."),
});

// US-CM-01 — sentinelle pour faire échouer/rollback la transaction de
// createChildAccount sans écrire d'AuditLog quand le parent sélectionné
// n'est plus valide (cf. plus bas).
class InvalidGuardianError extends Error {}

// better-auth v1.6 doesn't expose a public password-hashing API.
// We access the internal $context to reuse the same scrypt hasher used at sign-up,
// ensuring admin-forced resets are compatible with better-auth's credential verification.
async function hashWithBetterAuth(plaintext: string): Promise<string> {
  type BetterAuthCtx = { password: { hash(p: string): Promise<string> } };
  const ctx = await (auth as unknown as { $context: Promise<BetterAuthCtx> }).$context;
  return ctx.password.hash(plaintext);
}

// US-32 — garde générique : renvoie l'utilisateur courant s'il a la permission,
// sinon une erreur. Permet à la SECRÉTAIRE d'agir sur les inscriptions/comptes.
type Actor = Awaited<ReturnType<typeof getCurrentUser>>;
async function ensureCan(
  action: Action,
): Promise<Actor | ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, action)) {
    return { error: "Action non autorisée." };
  }
  return user;
}

// US-32 — empêche un acteur non-ADMIN d'attribuer des rôles sensibles
// (ADMIN / Responsable de groupe). Renvoie une erreur le cas échéant.
function assertAssignable(actor: Actor, roles: string[]): ActionResult | null {
  const forbidden = roles.filter((r) => !canAssignRole(actor, r));
  if (forbidden.length > 0) {
    return {
      error:
        "Tu n'as pas le droit d'attribuer les rôles ADMIN ou Responsable de groupe.",
    };
  }
  return null;
}

function parseRoles(raw: string | null | undefined): string[] {
  try {
    const p = JSON.parse(raw ?? "[]");
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

// US-32 — la SECRÉTAIRE gère les comptes comme un admin, MAIS ne peut pas agir
// (suspendre / supprimer / réinitialiser / changer l'unité) sur un compte qui
// porte ADMIN ou Responsable de groupe. L'ADMIN, lui, agit sur tout le monde.
async function assertCanManageTarget(
  actor: Actor,
  targetUserId: string,
): Promise<ActionResult | null> {
  if (can(actor, "admin.access")) return null;
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { roles: true },
  });
  const roles = parseRoles(target?.roles);
  if (roles.some((r) => !canAssignRole(actor, r))) {
    return {
      error:
        "Tu ne peux pas gérer un compte ADMIN ou Responsable de groupe.",
    };
  }
  return null;
}

// ----------------------------------------------------------------------------
// /admin/inscriptions
// ----------------------------------------------------------------------------

export async function approveUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.approve");
  if ("error" in actor) return actor;

  const parsed = approveSchema.safeParse({
    userId: formData.get("userId"),
    roles: formData.getAll("role"),
    unit: formData.get("unit") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  // SEC-08 (Vuln 1) — approveUser réécrit status + roles sans jamais vérifier
  // QUI est la cible : sans ces deux gardes, un SECRÉTAIRE peut passer l'id
  // d'un compte ADMIN/RG déjà actif et le rétrograder en SCOUT.
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { status: true },
  });
  if (target?.status !== "PENDING") {
    return { error: "Cette inscription n'est plus en attente de validation." };
  }

  const roles = [...new Set(parsed.data.roles)];
  const escalation = assertAssignable(actor, roles);
  if (escalation) return escalation;

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: {
          status: "ACTIVE",
          roles: JSON.stringify(roles),
          role: roles[0], // miroir d'affichage (déprécié)
          unit: parsed.data.unit,
          emailVerified: true,
          rejectedReason: null,
        },
      }),
    {
      action: "USER_APPROVED",
      userId: actor.id,
      metadata: {
        targetUserId: parsed.data.userId,
        assignedRoles: roles,
      },
    },
  );

  revalidatePath("/admin/inscriptions");
  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

export async function rejectUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.approve");
  if ("error" in actor) return actor;

  const parsed = rejectSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  // SEC-08 (Vuln 1) — même garde qu'approveUser : rejectUser passe le compte
  // cible en REJECTED (déconnexion immédiate, cf. proxy.ts) sans vérifier qui
  // est la cible ni qu'elle est bien une inscription en attente.
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { status: true },
  });
  if (target?.status !== "PENDING") {
    return { error: "Cette inscription n'est plus en attente de validation." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: {
          status: "REJECTED",
          rejectedReason: parsed.data.reason,
        },
      }),
    {
      action: "USER_REJECTED",
      userId: actor.id,
      metadata: {
        targetUserId: parsed.data.userId,
        reason: parsed.data.reason,
      },
    },
  );

  // SEC-08 (Vuln 4) — même geste que suspendUser : révoque toute session
  // active immédiatement plutôt que d'attendre son expiration naturelle.
  await db.session.deleteMany({ where: { userId: parsed.data.userId } });

  revalidatePath("/admin/inscriptions");
  return { error: null };
}

// ----------------------------------------------------------------------------
// /admin/utilisateurs
// ----------------------------------------------------------------------------

// US-32 — définit l'ensemble unifié des rôles d'un compte (tout le catalogue).
// ADMIN + SECRÉTAIRE ; la SECRÉTAIRE ne peut pas toucher aux rôles ADMIN/RG
// (ni les attribuer, ni les retirer). Tracé en audit.
export async function setUserRoles(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = rolesSchema.safeParse({
    userId: formData.get("userId"),
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  // Dédoublonne et garde un ordre stable.
  const roles = [...new Set(parsed.data.roles)];

  // Garde-fou : un admin ne peut pas se retirer le rôle ADMIN lui-même.
  if (parsed.data.userId === actor.id && !roles.includes("ADMIN")) {
    return { error: "Tu ne peux pas te retirer le rôle ADMIN toi-même." };
  }

  // Anti-élévation : un acteur non-ADMIN (SECRÉTAIRE) ne peut pas attribuer
  // ADMIN/RG…
  const escalation = assertAssignable(actor, roles);
  if (escalation) return escalation;

  // …ni retirer un rôle sensible existant (sinon il pourrait rétrograder un
  // ADMIN/RG). On vérifie l'état actuel de la cible.
  if (!can(actor, "admin.access")) {
    const target = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { roles: true },
    });
    let current: string[] = [];
    try {
      const p = JSON.parse(target?.roles ?? "[]");
      if (Array.isArray(p)) current = p.map(String);
    } catch {
      current = [];
    }
    if (current.some((r) => !canAssignRole(actor, r))) {
      return {
        error:
          "Tu ne peux pas modifier les rôles d'un compte ADMIN ou Responsable de groupe.",
      };
    }
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: {
          roles: JSON.stringify(roles),
          role: roles[0] ?? "SCOUT", // miroir d'affichage (déprécié)
        },
      }),
    {
      action: "USER_ROLE_CHANGED",
      userId: actor.id,
      metadata: {
        targetUserId: parsed.data.userId,
        roles,
      },
    },
  );

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

// US-32 — change la branche/unité d'un membre. ADMIN + SECRÉTAIRE ; la
// SECRÉTAIRE ne peut pas toucher un compte ADMIN/RG. Tracé en audit.
export async function setUserUnit(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = unitSchema.safeParse({
    userId: formData.get("userId"),
    unit: formData.get("unit") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { unit: parsed.data.unit },
      }),
    {
      action: "USER_UNIT_CHANGED",
      userId: actor.id,
      metadata: { targetUserId: parsed.data.userId, unit: parsed.data.unit },
    },
  );

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

// SAFE-01 — corrige la date de naissance d'un compte. La date pilote la
// protection des mineurs (`dm-policy.ts`) : elle n'est plus modifiable par son
// titulaire, donc une faute de frappe à l'inscription exige une intervention
// d'administrateur. Les métadonnées conservent l'ancienne ET la nouvelle
// valeur, sans quoi la trace ne dirait pas ce qui a changé.
export async function setUserBirthDate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = birthDateAdminSchema.safeParse({
    userId: formData.get("userId"),
    birthDate: formData.get("birthDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { birthDate: true },
  });
  if (!target) return { error: "Compte introuvable." };

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { birthDate: parsed.data.birthDate },
      }),
    {
      action: "USER_BIRTHDATE_CHANGED",
      userId: actor.id,
      metadata: {
        targetUserId: parsed.data.userId,
        from: target.birthDate?.toISOString() ?? null,
        to: parsed.data.birthDate.toISOString(),
      },
    },
  );

  revalidatePath("/admin/utilisateurs");
  revalidatePath(`/membres/${parsed.data.userId}`);
  return { error: null };
}

// US-26 — met à jour le profil parent enrichi (profession, compétences,
// disponibilités, infos) + le consentement RGPD. Réservé à l'admin, tracé.
export async function updateMemberProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // US-26 — géré par l'équipe de groupe (RG) ou l'admin (annuaire des compétences).
  const admin = await ensureCan("member.directory");
  if ("error" in admin) return admin;

  const parsed = memberProfileSchema.safeParse({
    userId: formData.get("userId"),
    profession: formData.get("profession"),
    skills: formData.get("skills"),
    availability: formData.get("availability"),
    helpNotes: formData.get("helpNotes"),
    skillsConsent: formData.get("skillsConsent"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { userId, ...profile } = parsed.data;
  await withAudit(
    (tx) => tx.user.update({ where: { id: userId }, data: profile }),
    {
      action: "USER_ROLE_CHANGED",
      userId: admin.id,
      metadata: { targetUserId: userId, profileUpdated: true },
    },
  );

  revalidatePath(`/membres/${userId}`);
  revalidatePath("/membres/annuaire");
  return { error: null };
}

export async function suspendUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  if (parsed.data.userId === actor.id) {
    return { error: "Tu ne peux pas te suspendre toi-même." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { status: "SUSPENDED" },
      }),
    {
      action: "USER_SUSPENDED",
      userId: actor.id,
      metadata: { targetUserId: parsed.data.userId },
    },
  );

  // Delete active sessions so the proxy invalidates them immediately on next
  // request rather than waiting for the session TTL to expire.
  await db.session.deleteMany({ where: { userId: parsed.data.userId } });

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

export async function reactivateUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { status: "ACTIVE" },
      }),
    {
      action: "USER_REACTIVATED",
      userId: actor.id,
      metadata: { targetUserId: parsed.data.userId },
    },
  );

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

export async function deleteUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  if (parsed.data.userId === actor.id) {
    return { error: "Tu ne peux pas te supprimer toi-même." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  const activeLoans = await db.loan.count({
    where: {
      borrowerId: parsed.data.userId,
      status: { in: ["ACTIF", "RETARD", "SECHAGE"] },
    },
  });
  if (activeLoans > 0) {
    return { error: "Impossible : l'utilisateur a des prêts actifs." };
  }

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { image: true },
  });
  if (!target) return { error: "Utilisateur introuvable." };

  // RGPD-04 — effacement réel : anonymise toute la PII (email, identité,
  // profil parent enrichi) et scrube le Consent lié, dans une même
  // transaction avec l'AuditLog (préserve l'intégrité référentielle des
  // prêts/incidents/audit historiques, cf. D-011).
  await withAudit(
    (tx) => anonymizeUserInTx(tx, parsed.data.userId),
    {
      action: "USER_DELETED",
      userId: actor.id,
      metadata: {
        targetUserId: parsed.data.userId,
        mode: "anonymized",
      },
    },
  );

  // Supprime sessions et credentials en dehors de la transaction principale
  // (non-critique si l'une échoue après que le compte soit marqué DELETED).
  await db.session.deleteMany({ where: { userId: parsed.data.userId } });
  await db.account.deleteMany({ where: { userId: parsed.data.userId } });

  // Best-effort : supprime l'avatar uploadé sur disque (ne bloque jamais
  // l'effacement si le fichier est déjà absent ou illisible).
  if (target.image?.startsWith("/uploads/")) {
    try {
      await unlink(join("public", target.image));
    } catch {
      // Silencieux : le fichier peut déjà être absent.
    }
  }

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

const changePasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordSchema,
});

export async function changeUserPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = changePasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  // US-CM-01 — un compte enfant (canLogin: false) n'a jamais de mot de passe
  // fonctionnel : refuse d'ouvrir par erreur une vraie capacité de connexion.
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { canLogin: true },
  });
  if (target?.canLogin === false) {
    return {
      error:
        "Ce compte est un compte enfant sans connexion : impossible de lui définir un mot de passe.",
    };
  }

  const hashed = await hashWithBetterAuth(parsed.data.password);

  await withAudit(
    (tx) =>
      tx.account.updateMany({
        where: { userId: parsed.data.userId, providerId: "credential" },
        data: { password: hashed },
      }),
    {
      action: "USER_PASSWORD_CHANGED",
      userId: actor.id,
      metadata: { targetUserId: parsed.data.userId },
    },
  );

  return { error: null };
}

const PLACEHOLDER_EMAIL_SUFFIX = "@piloti.invalid";

// US-CM-01 (évolution) — édition complète d'un compte par l'admin/secrétaire.
// Cas d'usage clé : un compte enfant (canLogin: false) grandit et passe en
// branche Scouts-Guides ou au-dessus → on lui renseigne une vraie adresse
// email ici, ce qui bascule AUTOMATIQUEMENT canLogin à true (pas de case à
// cocher séparée : c'est le renseignement d'une vraie adresse qui décide).
const updateAccountSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string().trim().min(1, "Prénom requis."),
  lastName: z.string().trim().min(1, "Nom requis."),
  email: z.string().trim().email("Email invalide."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export async function updateUserAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.manage");
  if ("error" in actor) return actor;

  const parsed = updateAccountSchema.safeParse({
    userId: formData.get("userId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const guard = await assertCanManageTarget(actor, parsed.data.userId);
  if (guard) return guard;

  const { userId, firstName, lastName, email, phone } = parsed.data;

  try {
    await withAudit(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { canLogin: true, email: true },
        });
        if (!target) throw new Error("Utilisateur introuvable.");

        const emailChanged = target.email !== email;
        // US-CM-01 — un compte enfant devient connectable dès qu'on lui
        // renseigne une vraie adresse (qui ne correspond plus au pattern
        // placeholder), sans case à cocher séparée.
        const canLoginEnabled =
          target.canLogin === false && !email.endsWith(PLACEHOLDER_EMAIL_SUFFIX);

        return {
          user: await tx.user.update({
            where: { id: userId },
            data: {
              firstName,
              lastName,
              name: `${firstName} ${lastName}`,
              email,
              phone,
              ...(emailChanged ? { emailVerified: false } : {}),
              ...(canLoginEnabled ? { canLogin: true } : {}),
            },
          }),
          canLoginEnabled,
        };
      },
      ({ canLoginEnabled }) => ({
        action: "USER_ACCOUNT_UPDATED",
        userId: actor.id,
        metadata: {
          targetUserId: userId,
          fields: ["firstName", "lastName", "email", "phone"],
          canLoginEnabled,
        },
      }),
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Cette adresse email est déjà utilisée." };
    }
    throw e;
  }

  revalidatePath("/admin/utilisateurs");
  revalidatePath("/membres");
  revalidatePath(`/membres/${userId}`);
  return { error: null };
}

// ----------------------------------------------------------------------------
// /admin/utilisateurs/nouveau-jeune (US-CM-01)
// ----------------------------------------------------------------------------

// US-CM-01 — crée un compte « enfant » (Farfadets/Louveteaux) sans connexion
// propre, rattaché dans la foulée au compte PARENT sélectionné (FamilyLink) :
// d'autres parents restent rattachables ensuite depuis la fiche membre.
// Réplique le pattern de register/actions.ts (User + Consent + FamilyLink
// dans la même transaction withAudit), mais sans passer par
// auth.api.signUpEmail (aucun mot de passe : le compte ne se connecte jamais).
export async function createChildAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await ensureCan("user.approve");
  if ("error" in actor) return actor;

  const parsed = childAccountSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    unit: formData.get("unit"),
    birthDate: formData.get("birthDate"),
    guardianUserId: formData.get("guardianUserId"),
    attestationDate: formData.get("attestationDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { firstName, lastName, unit, birthDate, guardianUserId, attestationDate } =
    parsed.data;
  // Email placeholder, jamais utilisé pour l'authentification (le compte n'a
  // pas de credential : canLogin: false + aucun Account créé).
  const placeholderEmail = `enfant-${crypto.randomUUID()}${PLACEHOLDER_EMAIL_SUFFIX}`;

  try {
    await withAudit(
      async (tx) => {
        // Ne jamais faire confiance à guardianUserId : vérifie dans la
        // transaction que c'est bien un compte PARENT actif existant, et
        // dérive le nom stocké dans Consent depuis la base (jamais de saisie
        // libre). Rejette en levant une erreur : la transaction (et donc
        // l'AuditLog) est annulée intégralement, rien n'est écrit.
        const guardian = await tx.user.findUnique({
          where: { id: guardianUserId },
          select: { id: true, firstName: true, lastName: true, roles: true, status: true },
        });
        if (
          !guardian ||
          guardian.status !== "ACTIVE" ||
          !parseRoles(guardian.roles).includes("PARENT")
        ) {
          throw new InvalidGuardianError();
        }

        const user = await tx.user.create({
          data: {
            email: placeholderEmail,
            emailVerified: false,
            name: `${firstName} ${lastName}`,
            firstName,
            lastName,
            birthDate,
            role: "SCOUT",
            roles: JSON.stringify(["SCOUT"]),
            status: "ACTIVE",
            unit,
            canLogin: false,
          },
        });
        const consent = await tx.consent.create({
          data: {
            userId: user.id,
            type: "PARENTAL",
            privacyVersion: PRIVACY_VERSION,
            guardianName: `${guardian.firstName} ${guardian.lastName}`,
            acceptedAt: attestationDate,
          },
        });
        const familyLink = await tx.familyLink.create({
          data: { parentId: guardian.id, childId: user.id },
        });
        return { user, consent, familyLink, guardian };
      },
      ({ user, consent, familyLink, guardian }) => ({
        action: "USER_CHILD_ACCOUNT_CREATED",
        userId: actor.id,
        metadata: {
          targetUserId: user.id,
          unit,
          consentId: consent.id,
          familyLinkId: familyLink.id,
          guardianName: `${guardian.firstName} ${guardian.lastName}`,
        },
      }),
    );
  } catch (e) {
    if (e instanceof InvalidGuardianError) {
      return {
        error:
          "Le responsable légal sélectionné est introuvable ou n'est plus un parent actif.",
      };
    }
    throw e;
  }

  revalidatePath("/admin/utilisateurs");
  revalidatePath("/membres");
  return { error: null };
}
