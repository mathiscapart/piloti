"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { passwordSchema } from "@/lib/password-policy";
import { can } from "@/lib/permissions";
import { ROLES } from "@/lib/enums";

import type { ActionResult } from "@/lib/types";

const approveSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

const rejectSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(1, "Indique une raison."),
});

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
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

async function ensureAdmin(): Promise<{ id: string } | ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) {
    return { error: "Accès réservé aux administrateurs." };
  }
  return user;
}

// ----------------------------------------------------------------------------
// /admin/inscriptions
// ----------------------------------------------------------------------------

export async function approveUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

  const parsed = approveSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: {
          status: "ACTIVE",
          role: parsed.data.role,
          emailVerified: true,
          rejectedReason: null,
        },
      }),
    {
      action: "USER_APPROVED",
      userId: admin.id,
      metadata: {
        targetUserId: parsed.data.userId,
        assignedRole: parsed.data.role,
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
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

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
      userId: admin.id,
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

export async function changeUserRole(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  if (parsed.data.userId === admin.id && parsed.data.role !== "ADMIN") {
    return { error: "Tu ne peux pas te retirer le rôle ADMIN toi-même." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { role: parsed.data.role },
      }),
    {
      action: "USER_ROLE_CHANGED",
      userId: admin.id,
      metadata: {
        targetUserId: parsed.data.userId,
        newRole: parsed.data.role,
      },
    },
  );

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}

export async function suspendUser(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  if (parsed.data.userId === admin.id) {
    return { error: "Tu ne peux pas te suspendre toi-même." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { status: "SUSPENDED" },
      }),
    {
      action: "USER_SUSPENDED",
      userId: admin.id,
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
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: { status: "ACTIVE" },
      }),
    {
      action: "USER_REACTIVATED",
      userId: admin.id,
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
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  if (parsed.data.userId === admin.id) {
    return { error: "Tu ne peux pas te supprimer toi-même." };
  }

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
    select: { email: true, firstName: true, lastName: true },
  });
  if (!target) return { error: "Utilisateur introuvable." };

  // Soft-delete via withAudit : anonymise l'email (préserve l'intégrité
  // référentielle des prêts/incidents/audit historiques).
  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: parsed.data.userId },
        data: {
          status: "DELETED",
          email: `deleted+${parsed.data.userId}@piloti.invalid`,
        },
      }),
    {
      action: "USER_DELETED",
      userId: admin.id,
      metadata: {
        deletedUserId: parsed.data.userId,
        deletedEmail: target.email,
        deletedName: `${target.firstName} ${target.lastName}`,
      },
    },
  );

  // Supprime sessions et credentials en dehors de la transaction principale
  // (non-critique si l'une échoue après que le compte soit marqué DELETED).
  await db.session.deleteMany({ where: { userId: parsed.data.userId } });
  await db.account.deleteMany({ where: { userId: parsed.data.userId } });

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
  const admin = await ensureAdmin();
  if ("error" in admin) return admin;

  const parsed = changePasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
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
      userId: admin.id,
      metadata: { targetUserId: parsed.data.userId },
    },
  );

  return { error: null };
}
