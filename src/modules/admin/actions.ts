"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { ROLES } from "@/lib/enums";

import type { ActionResult } from "@/modules/inventory/actions";

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

  // Invalide aussi les sessions actives du compte suspendu — elles seront
  // tuées au prochain check par le proxy.ts (status !== ACTIVE → clear cookie).
  // Pour aller plus vite on supprime explicitement les sessions DB.
  await import("@/lib/db").then(({ db }) =>
    db.session.deleteMany({ where: { userId: parsed.data.userId } }),
  );

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
      action: "USER_APPROVED", // réutilise la même action sémantique
      userId: admin.id,
      metadata: { targetUserId: parsed.data.userId, reactivated: true },
    },
  );

  revalidatePath("/admin/utilisateurs");
  return { error: null };
}
