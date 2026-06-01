"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";

import type { ActionResult } from "@/lib/types";

import { equipmentInputSchema } from "./types";


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

  const equipment = await withAudit(
    (tx) => tx.equipment.create({ data: parsed.data }),
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

  await withAudit(
    (tx) => tx.equipment.update({ where: { id }, data: parsed.data }),
    {
      action: "EQUIPMENT_UPDATED",
      userId: user.id,
      equipmentId: id,
      metadata: { changes: parsed.data },
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
