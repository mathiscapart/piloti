"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

import { eventSchema } from "./types";

// Les valeurs `datetime-local` (« YYYY-MM-DDTHH:mm ») n'ont pas de fuseau. On
// les interprète comme une heure « murale » figée, stockée telle quelle en UTC
// (et réaffichée en UTC) : ce qui est saisi est exactement ce qui est montré,
// sans dépendre du fuseau du serveur. Cf. `toDatetimeLocal` côté UI.
function parseWallTime(str: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
}

function parseDates(
  startStr: string,
  endStr: string,
): { start: Date; end: Date } | { error: string } {
  const start = parseWallTime(startStr);
  const end = parseWallTime(endStr);
  if (!start || !end) return { error: "Dates invalides." };
  if (end < start) {
    return { error: "La date de fin doit être postérieure au début." };
  }
  return { start, end };
}

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    unit: formData.get("unit"),
    location: formData.get("location"),
    description: formData.get("description"),
  };
}

// US-P01 — créer un événement (réservé aux encadrants).
export async function createEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) {
    return { error: "Tu n'as pas la permission de créer un événement." };
  }

  const parsed = eventSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const dates = parseDates(parsed.data.startDate, parsed.data.endDate);
  if ("error" in dates) return { error: dates.error };

  await withAudit(
    (tx) =>
      tx.event.create({
        data: {
          name: parsed.data.name,
          type: parsed.data.type,
          startDate: dates.start,
          endDate: dates.end,
          unit: parsed.data.unit,
          location: parsed.data.location,
          description: parsed.data.description,
          createdById: user.id,
        },
      }),
    (event) => ({
      action: "EVENT_CREATED",
      userId: user.id,
      metadata: { eventId: event.id, name: event.name, type: event.type },
    }),
  );

  revalidatePath("/planning");
  revalidatePath("/dashboard");
  redirect("/planning?notice=event-created");
}

// US-P03 — modifier un événement.
export async function updateEvent(
  eventId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) {
    return { error: "Tu n'as pas la permission de modifier un événement." };
  }
  const existing = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!existing) return { error: "Événement introuvable." };

  const parsed = eventSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const dates = parseDates(parsed.data.startDate, parsed.data.endDate);
  if ("error" in dates) return { error: dates.error };

  await withAudit(
    (tx) =>
      tx.event.update({
        where: { id: eventId },
        data: {
          name: parsed.data.name,
          type: parsed.data.type,
          startDate: dates.start,
          endDate: dates.end,
          unit: parsed.data.unit,
          location: parsed.data.location,
          description: parsed.data.description,
        },
      }),
    {
      action: "EVENT_UPDATED",
      userId: user.id,
      metadata: { eventId, name: parsed.data.name },
    },
  );

  revalidatePath("/planning");
  revalidatePath(`/planning/${eventId}`);
  revalidatePath("/dashboard");
  redirect(`/planning/${eventId}?notice=event-updated`);
}

// US-P03 — supprimer (annuler) un événement.
export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) {
    return { error: "Tu n'as pas la permission de supprimer un événement." };
  }
  const existing = await db.event.findUnique({
    where: { id: eventId },
    select: { name: true },
  });
  if (!existing) return { error: "Événement introuvable." };

  await withAudit(
    (tx) => tx.event.delete({ where: { id: eventId } }),
    {
      action: "EVENT_DELETED",
      userId: user.id,
      metadata: { eventId, name: existing.name },
    },
  );

  revalidatePath("/planning");
  revalidatePath("/dashboard");
  redirect("/planning?notice=event-deleted");
}
