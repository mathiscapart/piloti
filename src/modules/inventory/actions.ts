"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { parseAndValidate } from "@/lib/import-equipment";
import { can } from "@/lib/permissions";

import type { ActionResult } from "@/lib/types";

import { equipmentInputSchema } from "./types";

// US-17 — un article d'une catégorie pesable est géré à l'unité : quantité = 1
// et poids de base obligatoire. Mutualisé entre création et édition.
async function resolveWeighable(
  p: z.infer<typeof equipmentInputSchema>,
): Promise<
  | { error: string }
  | {
      name: string;
      category: string;
      totalQty: number;
      condition: string;
      location: string | null;
      photo: string | null;
      notes: string | null;
      baseWeightKg: number | null;
    }
> {
  const category = await db.category.findUnique({
    where: { slug: p.category },
    select: { requireWeighing: true },
  });
  const weighable = !!category?.requireWeighing;
  if (weighable && p.baseWeightKg === undefined) {
    return { error: "Catégorie pesable : indique le poids de base (kg)." };
  }
  return {
    name: p.name,
    category: p.category,
    totalQty: weighable ? 1 : p.totalQty,
    condition: p.condition,
    location: p.location ?? null,
    photo: p.photo ?? null,
    notes: p.notes ?? null,
    baseWeightKg: weighable ? (p.baseWeightKg ?? null) : null,
  };
}


export async function createEquipment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.create")) {
    return { error: "Vous n'avez pas la permission d'ajouter du matériel." };
  }

  const parsed = equipmentInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const data = await resolveWeighable(parsed.data);
  if ("error" in data) return data;

  const equipment = await withAudit(
    (tx) => tx.equipment.create({ data }),
    (created) => ({
      action: "EQUIPMENT_CREATED",
      userId: user.id,
      equipmentId: created.id,
      metadata: { name: created.name, category: created.category },
    }),
  );

  revalidatePath("/stock");
  revalidatePath("/dashboard");
  redirect(`/stock/${equipment.id}?notice=equipment-created`);
}

export async function updateEquipment(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.update")) {
    return { error: "Vous n'avez pas la permission de modifier ce matériel." };
  }

  const parsed = equipmentInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const data = await resolveWeighable(parsed.data);
  if ("error" in data) return data;

  await withAudit(
    (tx) => tx.equipment.update({ where: { id }, data }),
    {
      action: "EQUIPMENT_UPDATED",
      userId: user.id,
      equipmentId: id,
      metadata: { changes: data },
    },
  );

  revalidatePath("/stock");
  revalidatePath(`/stock/${id}`);
  revalidatePath("/dashboard");
  redirect(`/stock/${id}?notice=equipment-updated`);
}

// US-15 — associe (ou remplace) un tag NFC à un article. UID unique : si déjà
// pris par un autre article, on refuse avec un message clair.
export async function setEquipmentNfc(
  id: string,
  uid: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.update")) {
    return { error: "Vous n'avez pas la permission de modifier ce matériel." };
  }

  const cleanUid = uid.trim();
  if (!cleanUid) return { error: "UID NFC vide." };

  const existing = await db.equipment.findUnique({
    where: { nfcUid: cleanUid },
    select: { id: true, name: true },
  });
  if (existing && existing.id !== id) {
    return { error: `Ce tag est déjà associé à « ${existing.name} ».` };
  }

  await withAudit(
    (tx) => tx.equipment.update({ where: { id }, data: { nfcUid: cleanUid } }),
    {
      action: "EQUIPMENT_UPDATED",
      userId: user.id,
      equipmentId: id,
      metadata: { nfcUid: cleanUid },
    },
  );

  revalidatePath(`/stock/${id}`);
  return { error: null };
}

// US-15 — dissocie le tag NFC (remplacement d'autocollant abîmé).
export async function clearEquipmentNfc(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.update")) {
    return { error: "Vous n'avez pas la permission de modifier ce matériel." };
  }

  await withAudit(
    (tx) => tx.equipment.update({ where: { id }, data: { nfcUid: null } }),
    {
      action: "EQUIPMENT_UPDATED",
      userId: user.id,
      equipmentId: id,
      metadata: { nfcUid: null },
    },
  );

  revalidatePath(`/stock/${id}`);
  return { error: null };
}

// US-22 — import d'inventaire depuis un CSV. Re-valide côté serveur (source de
// vérité), crée les lignes valides + audit, et renvoie un rapport.
export interface ImportReport {
  created: number;
  duplicates: number;
  errors: number;
  issues: { line: number; name: string; message: string }[];
}

export async function importEquipment(
  csvText: string,
): Promise<{ error: string | null; report?: ImportReport }> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.create")) {
    return { error: "Vous n'avez pas la permission d'importer du matériel." };
  }

  const [categories, existing] = await Promise.all([
    db.category.findMany({
      where: { archived: false },
      select: { slug: true, label: true },
    }),
    db.equipment.findMany({ select: { name: true } }),
  ]);

  const { headerError, rows } = parseAndValidate(csvText, {
    categories,
    existingNames: existing.map((e) => e.name),
  });
  if (headerError) return { error: headerError };
  if (rows.length === 0) return { error: "Aucune ligne de données détectée." };

  const ok = rows.filter((r) => r.status === "ok");
  const duplicates = rows.filter((r) => r.status === "duplicate").length;
  const errors = rows.filter((r) => r.status === "error").length;
  const issues = rows
    .filter((r) => r.status !== "ok" && r.message)
    .map((r) => ({ line: r.line, name: r.name, message: r.message! }));

  if (ok.length === 0) {
    return {
      error: "Aucune ligne valide à importer (doublons ou erreurs uniquement).",
    };
  }

  await db.$transaction(async (tx) => {
    const created = await Promise.all(
      ok.map((r) =>
        tx.equipment.create({
          data: {
            name: r.name,
            category: r.category,
            totalQty: r.quantity,
            condition: r.condition,
            location: r.location ?? null,
            notes: r.notes ?? null,
          },
        }),
      ),
    );
    await tx.auditLog.createMany({
      data: created.map((eq) => ({
        action: "EQUIPMENT_CREATED",
        userId: user.id,
        equipmentId: eq.id,
        metadata: JSON.stringify({ name: eq.name, import: true }),
      })),
    });
  });

  revalidatePath("/stock");
  revalidatePath("/dashboard");

  return {
    error: null,
    report: { created: ok.length, duplicates, errors, issues },
  };
}

export async function archiveEquipment(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "equipment.archive")) {
    return { error: "Seul un administrateur peut archiver un article." };
  }

  await withAudit(
    (tx) => tx.equipment.update({ where: { id }, data: { archived: true } }),
    {
      action: "EQUIPMENT_ARCHIVED",
      userId: user.id,
      equipmentId: id,
    },
  );

  revalidatePath("/stock");
  revalidatePath(`/stock/${id}`);
  redirect("/stock?notice=equipment-archived");
}
