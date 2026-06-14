"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notificationEmailHtml, sendEmail } from "@/lib/email";
import { RSVP_LABEL, RSVP_RESPONSES, type RsvpResponse } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { isChildOf } from "@/modules/family/queries";

import { maybeAlertAbsences, notifyEventAudience } from "./event-hooks";
import { eventSchema } from "./types";

function absoluteUrl(path: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

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
    campPlaceId: formData.get("campPlaceId"),
    registrationOpen: formData.get("registrationOpen"),
    registrationDeadline: formData.get("registrationDeadline"),
  };
}

// La date limite d'inscription (datetime-local, optionnelle) suit la même règle
// d'heure murale que les dates de l'événement.
function parseDeadline(
  raw: string | null,
): { value: Date | null } | { error: string } {
  if (!raw) return { value: null };
  const d = parseWallTime(raw);
  if (!d) return { error: "Date limite d'inscription invalide." };
  return { value: d };
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
  const deadline = parseDeadline(parsed.data.registrationDeadline);
  if ("error" in deadline) return { error: deadline.error };

  const created = await withAudit(
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
          campPlaceId: parsed.data.campPlaceId,
          registrationOpen: parsed.data.registrationOpen,
          registrationDeadline: deadline.value,
          createdById: user.id,
        },
      }),
    (event) => ({
      action: "EVENT_CREATED",
      userId: user.id,
      metadata: { eventId: event.id, name: event.name, type: event.type },
    }),
  );

  // Fixation logique : notifie l'unité (jeunes + parents) + poste au salon.
  after(() => notifyEventAudience(created, user.id, "created"));

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
  const deadline = parseDeadline(parsed.data.registrationDeadline);
  if ("error" in deadline) return { error: deadline.error };

  const updated = await withAudit(
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
          campPlaceId: parsed.data.campPlaceId,
          registrationOpen: parsed.data.registrationOpen,
          registrationDeadline: deadline.value,
        },
      }),
    {
      action: "EVENT_UPDATED",
      userId: user.id,
      metadata: { eventId, name: parsed.data.name },
    },
  );

  after(() => notifyEventAudience(updated, user.id, "updated"));

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
    select: {
      id: true,
      name: true,
      unit: true,
      startDate: true,
      endDate: true,
      location: true,
    },
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

  // Fixation logique : prévient l'unité de l'annulation (+ message salon).
  after(() => notifyEventAudience(existing, user.id, "cancelled"));

  revalidatePath("/planning");
  revalidatePath("/dashboard");
  redirect("/planning?notice=event-deleted");
}

// US-P07 — pointer la présence d'un membre à un événement (réservé aux chefs).
// Modifiable à tout moment (corriger une erreur).
export async function setAttendance(
  eventId: string,
  userId: string,
  present: boolean,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "event.manage")) {
    return { error: "Réservé aux chefs." };
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return { error: "Événement introuvable." };

  await withAudit(
    (tx) =>
      tx.attendance.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, present, markedById: actor.id },
        update: { present, markedById: actor.id },
      }),
    {
      action: "EVENT_ATTENDANCE",
      userId: actor.id,
      metadata: { eventId, userId, present },
    },
  );

  // Fixation logique (US-P08) : si le jeune est marqué absent et franchit le
  // seuil d'absences consécutives, on alerte ses parents.
  if (!present) {
    after(() => maybeAlertAbsences(eventId, userId));
  }

  revalidatePath(`/planning/${eventId}/presences`);
  revalidatePath(`/planning/${eventId}`);
  return { error: null };
}

// US-P04 — un membre répond à un événement ouvert aux inscriptions
// (présent / absent / peut-être). Réponse modifiable ; confirmation par email.
// Un parent peut répondre pour un de ses enfants rattachés (`targetUserId`).
export async function rsvpEvent(
  eventId: string,
  response: string,
  targetUserId?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!(RSVP_RESPONSES as readonly string[]).includes(response)) {
    return { error: "Réponse invalide." };
  }

  // Cible : soi-même par défaut, sinon un enfant rattaché (autorisation).
  const targetId = targetUserId ?? user.id;
  let targetName: string | null = null;
  if (targetId !== user.id) {
    const ok = await isChildOf(user.id, targetId);
    if (!ok) {
      return { error: "Tu ne peux inscrire que tes enfants rattachés." };
    }
    const child = await db.user.findUnique({
      where: { id: targetId },
      select: { firstName: true, lastName: true },
    });
    if (!child) return { error: "Compte introuvable." };
    targetName = `${child.firstName} ${child.lastName}`;
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      registrationOpen: true,
      registrationDeadline: true,
    },
  });
  if (!event) return { error: "Événement introuvable." };
  if (!event.registrationOpen) {
    return { error: "Les inscriptions ne sont pas ouvertes pour cet événement." };
  }
  if (event.registrationDeadline && event.registrationDeadline < new Date()) {
    return { error: "La date limite d'inscription est dépassée." };
  }

  await withAudit(
    (tx) =>
      tx.eventRegistration.upsert({
        where: { eventId_userId: { eventId, userId: targetId } },
        create: { eventId, userId: targetId, response },
        update: { response },
      }),
    {
      action: "EVENT_RSVP",
      userId: user.id,
      metadata: { eventId, response, targetUserId: targetId },
    },
  );

  // Confirmation par email à la personne qui agit (best-effort, après réponse).
  const label = RSVP_LABEL[response as RsvpResponse];
  const body = targetName
    ? `Inscription enregistrée pour <strong>${targetName}</strong> : <strong>${label}</strong>.`
    : `Votre réponse a bien été enregistrée : <strong>${label}</strong>.`;
  after(() =>
    sendEmail({
      to: user.email,
      subject: `Inscription — ${event.name}`,
      html: notificationEmailHtml({
        title: event.name,
        body,
        url: absoluteUrl(`/planning/${eventId}`),
        cta: "Voir l'événement",
      }),
    }),
  );

  revalidatePath(`/planning/${eventId}`);
  return { error: null };
}
