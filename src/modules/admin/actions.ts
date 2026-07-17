"use server";

import { unlink } from "fs/promises";
import { join } from "path";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { anonymizeUserInTx } from "@/lib/anonymize";
import { auth } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { passwordSchema } from "@/lib/password-policy";
import { can, canAssignRole, type Action } from "@/lib/permissions";
import { ROLES, UNITS } from "@/lib/enums";

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
