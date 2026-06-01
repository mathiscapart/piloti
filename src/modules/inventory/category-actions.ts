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
  // US-24 — sous-catégorie : slug du parent (vide = catégorie racine).
  parentSlug: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
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
    parentSlug: formData.get("parentSlug"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const slug = toSlug(parsed.data.label);
  if (!slug) return { error: "Nom invalide." };

  const existing = await db.category.findUnique({ where: { slug } });
  if (existing) return { error: `La catégorie "${existing.label}" existe déjà.` };

  // US-24 — si on crée une sous-catégorie, le parent doit exister et être lui-même
  // une catégorie racine (profondeur max = 2 niveaux).
  const parentSlug = parsed.data.parentSlug;
  if (parentSlug) {
    const parent = await db.category.findUnique({ where: { slug: parentSlug } });
    if (!parent) return { error: "Catégorie parente introuvable." };
    if (parent.parentSlug) {
      return { error: "Une sous-catégorie ne peut pas en contenir d'autres (2 niveaux max)." };
    }
  }

  // Ordre calculé parmi les frères (même parent) pour un classement cohérent.
  const maxOrder = await db.category.aggregate({
    where: { parentSlug: parentSlug ?? null },
    _max: { order: true },
  });

  await withAudit(
    (tx) =>
      tx.category.create({
        data: {
          slug,
          label: parsed.data.label,
          canDry: parsed.data.canDry,
          parentSlug,
          order: (maxOrder._max.order ?? 0) + 1,
        },
      }),
    {
      action: "CATEGORY_CREATED",
      userId: user.id,
      metadata: { slug, label: parsed.data.label, parentSlug },
    },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/stock");
  revalidatePath("/stock/nouveau");
  return { error: null };
}

// US-24 — déplace une catégorie sous un parent (ou la remonte en racine si
// parentSlug est null). Garde-fous : pas de cycle, profondeur 2 max, et on ne
// peut pas rattacher une catégorie qui possède elle-même des sous-catégories.
export async function setCategoryParent(
  slug: string,
  parentSlug: string | null,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };

  const category = await db.category.findUnique({
    where: { slug },
    include: { children: { select: { slug: true } } },
  });
  if (!category) return { error: "Catégorie introuvable." };

  if (parentSlug) {
    if (parentSlug === slug) return { error: "Une catégorie ne peut pas être sa propre parente." };
    if (category.children.length > 0) {
      return {
        error: "Cette catégorie a des sous-catégories : déplace-les d'abord.",
      };
    }
    const parent = await db.category.findUnique({ where: { slug: parentSlug } });
    if (!parent) return { error: "Catégorie parente introuvable." };
    if (parent.parentSlug) {
      return { error: "Le parent choisi est déjà une sous-catégorie (2 niveaux max)." };
    }
  }

  if (category.parentSlug === (parentSlug ?? null)) return { error: null };

  const maxOrder = await db.category.aggregate({
    where: { parentSlug: parentSlug ?? null },
    _max: { order: true },
  });

  await withAudit(
    (tx) =>
      tx.category.update({
        where: { slug },
        data: { parentSlug, order: (maxOrder._max.order ?? 0) + 1 },
      }),
    {
      action: "CATEGORY_UPDATED",
      userId: user.id,
      metadata: { slug, parentSlug, from: category.parentSlug },
    },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/stock");
  revalidatePath("/stock/nouveau");
  return { error: null };
}

// US-31 — « Archiver » remplace la suppression définitive. Une catégorie archivée
// n'apparaît plus dans les listes de choix mais conserve son matériel archivé et
// tout l'historique. Autorisé seulement si :
//   - ce n'est PAS la catégorie « Autre » (réceptacle par défaut, non archivable) ;
//   - elle n'a plus de sous-catégorie active (les traiter d'abord) ;
//   - elle ne contient plus aucun article actif (non archivé).
export async function archiveCategory(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };

  if (slug === "AUTRE") {
    return { error: "La catégorie « Autre » ne peut pas être archivée." };
  }

  const category = await db.category.findUnique({ where: { slug } });
  if (!category) return { error: "Catégorie introuvable." };
  if (category.archived) return { error: null };

  const activeChildren = await db.category.count({
    where: { parentSlug: slug, archived: false },
  });
  if (activeChildren > 0) {
    return {
      error: `Impossible : ${activeChildren} sous-catégorie(s) active(s) à archiver d'abord.`,
    };
  }

  const activeEquipment = await db.equipment.count({
    where: { category: slug, archived: false },
  });
  if (activeEquipment > 0) {
    return {
      error: `Impossible : ${activeEquipment} article(s) actif(s). Archive ou déplace-les d'abord.`,
    };
  }

  await withAudit(
    (tx) => tx.category.update({ where: { slug }, data: { archived: true } }),
    {
      action: "CATEGORY_ARCHIVED",
      userId: user.id,
      metadata: { slug, label: category.label },
    },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/stock");
  revalidatePath("/stock/nouveau");
  return { error: null };
}

// US-31 — restaure une catégorie archivée. Si elle est rattachée à un parent
// lui-même archivé, on demande de restaurer le parent d'abord (cohérence).
export async function unarchiveCategory(slug: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };

  const category = await db.category.findUnique({
    where: { slug },
    include: { parent: { select: { archived: true, label: true } } },
  });
  if (!category) return { error: "Catégorie introuvable." };
  if (!category.archived) return { error: null };
  if (category.parent?.archived) {
    return { error: `Restaure d'abord la catégorie parente « ${category.parent.label} ».` };
  }

  await withAudit(
    (tx) => tx.category.update({ where: { slug }, data: { archived: false } }),
    {
      action: "CATEGORY_RESTORED",
      userId: user.id,
      metadata: { slug, label: category.label },
    },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/stock");
  revalidatePath("/stock/nouveau");
  return { error: null };
}

// US-17 — comportements configurables par catégorie. Chaque option est un
// booléen hérité par tous les articles de la catégorie (existants et futurs).
const CATEGORY_BEHAVIORS = ["canDry", "requireWeighing"] as const;
export type CategoryBehavior = (typeof CATEGORY_BEHAVIORS)[number];

export async function updateCategoryBehavior(
  slug: string,
  behavior: CategoryBehavior,
  value: boolean,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) return { error: "Accès refusé." };
  if (!CATEGORY_BEHAVIORS.includes(behavior)) {
    return { error: "Comportement inconnu." };
  }

  await withAudit(
    (tx) => tx.category.update({ where: { slug }, data: { [behavior]: value } }),
    {
      action: "CATEGORY_UPDATED",
      userId: user.id,
      metadata: { slug, behavior, value },
    },
  );

  revalidatePath("/admin/categories");
  revalidatePath("/prets");
  return { error: null };
}
