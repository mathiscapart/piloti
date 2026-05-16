"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

const MAX_LABEL_LENGTH = 40;

const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Nom requis.")
    .max(MAX_LABEL_LENGTH, `${MAX_LABEL_LENGTH} caractères max.`),
  canDry: z.coerce.boolean().optional().default(false),
});

// Converts a human label to a URL/DB-safe uppercase slug.
// Uses NFD decomposition to strip diacritics before removing non-alphanumeric chars.
function toSlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function createCategory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };

  const parsed = categorySchema.safeParse({
    label: formData.get("label"),
    canDry: formData.get("canDry") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const slug = toSlug(parsed.data.label);
  if (!slug) return { error: "Nom invalide." };

  const existing = await db.category.findUnique({ where: { slug } });
  if (existing) return { error: `La catégorie "${existing.label}" existe déjà.` };

  const maxOrder = await db.category.aggregate({ _max: { order: true } });

  await withAudit(
    (tx) =>
      tx.category.create({
        data: {
          slug,
          label: parsed.data.label,
          canDry: parsed.data.canDry,
          order: (maxOrder._max.order ?? 0) + 1,
        },
      }),
    { action: "CATEGORY_CREATED", userId: user.id, metadata: { slug, label: parsed.data.label } },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/stock/nouveau");
  return { error: null };
}

export async function deleteCategory(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };

  const usedBy = await db.equipment.count({ where: { category: slug } });
  if (usedBy > 0) {
    return { error: `Impossible : ${usedBy} article(s) utilisent cette catégorie.` };
  }

  const category = await db.category.findUnique({ where: { slug } });
  if (!category) return { error: "Catégorie introuvable." };

  await withAudit(
    (tx) => tx.category.delete({ where: { slug } }),
    { action: "CATEGORY_DELETED", userId: user.id, metadata: { slug, label: category.label } },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/stock/nouveau");
  return { error: null };
}

export async function updateCategoryCanDry(
  slug: string,
  canDry: boolean,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };

  await withAudit(
    (tx) => tx.category.update({ where: { slug }, data: { canDry } }),
    { action: "CATEGORY_UPDATED", userId: user.id, metadata: { slug, canDry } },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/prets");
  return { error: null };
}
