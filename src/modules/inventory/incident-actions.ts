"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { withAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";

import type { ActionResult } from "@/lib/types";
import { createIncidentSchema, resolveIncidentSchema } from "./types";

export async function createIncident(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "incident.report")) {
    return { error: "Permission refusée." };
  }

  const parsed = createIncidentSchema.safeParse({
    equipmentId: formData.get("equipmentId"),
    types: formData.getAll("type").map(String),
    severity: formData.get("severity"),
    notes: formData.get("notes"),
    photos: formData.getAll("photo").map(String).filter(Boolean),
    loanId: formData.get("loanId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  await withAudit(
    (tx) =>
      tx.incident.create({
        data: {
          equipmentId: parsed.data.equipmentId,
          reporterId: user.id,
          types: JSON.stringify(parsed.data.types),
          severity: parsed.data.severity,
          photos: JSON.stringify(parsed.data.photos ?? []),
          notes: parsed.data.notes,
        },
      }),
    (created) => ({
      action: "INCIDENT_REPORTED",
      userId: user.id,
      equipmentId: parsed.data.equipmentId,
      incidentId: created.id,
      loanId: parsed.data.loanId,
      metadata: {
        severity: parsed.data.severity,
        types: parsed.data.types,
        photoCount: parsed.data.photos?.length ?? 0,
      },
    }),
  );

  revalidatePath("/incidents");
  revalidatePath("/dashboard");
  revalidatePath(`/stock/${parsed.data.equipmentId}`);
  redirect("/incidents");
}

export async function resolveIncident(
  incidentId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "incident.resolve")) {
    return { error: "Seul un administrateur peut résoudre un incident." };
  }

  const parsed = resolveIncidentSchema.safeParse({
    resolvedNote: formData.get("resolvedNote"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    select: { id: true, equipmentId: true, resolvedAt: true },
  });
  if (!incident) return { error: "Incident introuvable." };
  if (incident.resolvedAt) return { error: "Incident déjà résolu." };

  await withAudit(
    (tx) =>
      tx.incident.update({
        where: { id: incidentId },
        data: {
          resolvedAt: new Date(),
          resolvedById: user.id,
          resolvedNote: parsed.data.resolvedNote,
        },
      }),
    {
      action: "INCIDENT_RESOLVED",
      userId: user.id,
      incidentId,
      equipmentId: incident.equipmentId,
      metadata: parsed.data.resolvedNote
        ? { note: parsed.data.resolvedNote }
        : {},
    },
  );

  revalidatePath("/incidents");
  revalidatePath("/dashboard");
  revalidatePath(`/stock/${incident.equipmentId}`);
  return { error: null };
}
