"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { ZodError } from "zod";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notificationEmailHtml, sendEmail } from "@/lib/email";
import { RSVP_LABEL, RSVP_RESPONSES, type RsvpResponse } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { isChildOf } from "@/modules/family/queries";

import { maybeAlertAbsences, notifyEventAudience } from "./event-hooks";
import { canActOnEvent, refuseIfEventOutOfScope } from "./event-scope";
import { eventSchema, withdrawalReasonSchema } from "./types";

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

// `FormData.get()` renvoie `null` (pas `""`) quand le champ est absent du DOM
// — ex. le <select> campPlaceId n'est pas rendu s'il n'y a aucun lieu de camp.
// Le schéma Zod n'accepte que `string | undefined` : on normalise ici pour
// éviter de laisser fuir un message Zod brut ("expected string, received null").
function readForm(formData: FormData) {
  const str = (key: string) => formData.get(key)?.toString() ?? "";
  return {
    name: str("name"),
    type: str("type"),
    startDate: str("startDate"),
    endDate: str("endDate"),
    unit: str("unit"),
    location: str("location"),
    description: str("description"),
    campPlaceId: str("campPlaceId"),
    registrationOpen: formData.get("registrationOpen"),
    registrationDeadline: str("registrationDeadline"),
  };
}

// Nos schémas portent un message français pour chaque cas attendu ; si un
// message Zod technique fuit malgré tout (ex. "Invalid input: expected
// string, received null"), on retombe sur un message compréhensible plutôt
// que d'exposer le jargon interne de la validation.
function formErrorMessage(error: ZodError): string {
  const message = error.issues[0]?.message;
  if (!message || /expected .+, received/i.test(message)) {
    return "Certains champs du formulaire sont invalides. Vérifie les informations saisies.";
  }
  return message;
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
    return { error: formErrorMessage(parsed.error) };
  }
  // Périmètre d'unité (D-024) : un chef crée pour SA branche, ou pour tout le
  // groupe. Sans ce contrôle, la branche cible n'est qu'un champ du formulaire.
  if (!canActOnEvent(user, "event.manage", parsed.data.unit)) {
    return { error: "Tu ne peux créer un événement que pour ta branche." };
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
    select: { id: true, unit: true },
  });
  if (!existing) return { error: "Événement introuvable." };
  // Périmètre d'unité : sur la branche ACTUELLE de l'événement…
  if (!canActOnEvent(user, "event.manage", existing.unit)) {
    return { error: "Cet événement concerne une autre branche." };
  }

  const parsed = eventSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: formErrorMessage(parsed.error) };
  }
  // …ET sur la branche CIBLE : sans ce second contrôle, il suffirait de changer
  // la branche dans le formulaire pour transférer un événement à une autre unité.
  if (!canActOnEvent(user, "event.manage", parsed.data.unit)) {
    return { error: "Tu ne peux pas déplacer cet événement vers une autre branche." };
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
  // Périmètre d'unité : la suppression est l'action la moins réversible du
  // planning, elle est bornée comme la modification.
  if (!canActOnEvent(user, "event.manage", existing.unit)) {
    return { error: "Cet événement concerne une autre branche." };
  }

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
    select: { id: true, unit: true },
  });
  if (!event) return { error: "Événement introuvable." };
  // Périmètre d'unité : un chef ne pointe que les événements de sa branche
  // (les événements de groupe restant ouverts à tous, cf. `canActOnEvent`).
  if (!canActOnEvent(actor, "event.manage", event.unit)) {
    return { error: "Cet événement concerne une autre branche." };
  }

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
// (présent / absent / peut-être), avec un commentaire libre optionnel
// (US-P05, ex : allergie, transport). Réponse modifiable ; confirmation par
// email. Un parent peut répondre pour un de ses enfants rattachés
// (`targetUserId`).
export async function rsvpEvent(
  eventId: string,
  response: string,
  targetUserId?: string,
  comment?: string,
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

  // US-P05 — un désistement acté par un chef est prioritaire et bloquant : le
  // membre/parent ne peut pas s'auto-réinscrire, seul un chef relève
  // l'inscription via addRegistration.
  const existing = await db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId: targetId } },
    select: { status: true },
  });
  if (existing?.status === "WITHDRAWN") {
    return {
      error:
        "Cette inscription a été désistée par un chef. Contacte un chef pour être réinscrit.",
    };
  }

  const trimmedComment = comment?.trim() || null;

  await withAudit(
    (tx) =>
      tx.eventRegistration.upsert({
        where: { eventId_userId: { eventId, userId: targetId } },
        create: { eventId, userId: targetId, response, comment: trimmedComment },
        update: { response, comment: trimmedComment },
      }),
    {
      action: "EVENT_RSVP",
      userId: user.id,
      metadata: { eventId, response, targetUserId: targetId },
    },
  );

  // Confirmation par email à la personne qui agit (best-effort, après réponse).
  // SEC-08 (Vuln 5) — plus de <strong> ici : notificationEmailHtml() échappe
  // désormais systématiquement `body`, et targetName est un nom de profil
  // (texte libre, potentiellement attaqué) qu'on ne veut pas faire passer
  // pour du HTML de confiance.
  const label = RSVP_LABEL[response as RsvpResponse];
  const body = targetName
    ? `Inscription enregistrée pour ${targetName} : ${label}.`
    : `Votre réponse a bien été enregistrée : ${label}.`;
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

// US-P05 — un chef inscrit manuellement un jeune (cas particulier, ou pour
// relever une inscription désistée). On revérifie toujours côté serveur que
// la cible est un jeune actif éligible : ne jamais faire confiance à un
// `userId` de formulaire pour une inscription.
export async function addRegistration(
  eventId: string,
  userId: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "event.manage")) {
    return { error: "Réservé aux chefs." };
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, unit: true },
  });
  if (!event) return { error: "Événement introuvable." };
  // Périmètre d'unité (D-024) : le contrôle d'éligibilité ci-dessous porte sur
  // la branche de la CIBLE ; celui-ci porte sur celle de l'ACTEUR. Sans lui, un
  // chef d'une autre branche inscrirait des jeunes sur cet événement.
  if (!canActOnEvent(actor, "event.manage", event.unit)) {
    return { error: "Cet événement concerne une autre branche." };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { status: true, roles: true, unit: true },
  });
  const isEligible =
    !!target &&
    target.status === "ACTIVE" &&
    (JSON.parse(target.roles || "[]") as string[]).includes("SCOUT") &&
    (!event.unit || target.unit === event.unit);
  if (!isEligible) return { error: "Jeune non éligible à cet événement." };

  await withAudit(
    (tx) =>
      tx.eventRegistration.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, response: "PRESENT", status: "REGISTERED" },
        update: { status: "REGISTERED", withdrawalReason: null },
      }),
    {
      action: "EVENT_REGISTRATION_ADDED",
      userId: actor.id,
      metadata: { eventId, userId },
    },
  );

  revalidatePath(`/planning/${eventId}`);
  return { error: null };
}

// US-P05 — un chef marque un désistement, avec motif. Bloque le RSVP du
// membre/parent tant qu'un chef n'a pas relevé l'inscription (cf. rsvpEvent).
export async function withdrawRegistration(
  eventId: string,
  userId: string,
  reason: string,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "event.manage")) {
    return { error: "Réservé aux chefs." };
  }

  const parsed = withdrawalReasonSchema.safeParse(reason);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Motif invalide." };
  }

  // Périmètre d'unité (D-024) : désister est une mutation sur l'événement,
  // bornée comme le pointage ou la modification.
  const outOfScope = await refuseIfEventOutOfScope(actor, "event.manage", eventId);
  if (outOfScope) return outOfScope;

  const existing = await db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });
  if (!existing) return { error: "Inscription introuvable." };

  await withAudit(
    (tx) =>
      tx.eventRegistration.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status: "WITHDRAWN", withdrawalReason: parsed.data },
      }),
    {
      action: "EVENT_REGISTRATION_WITHDRAWN",
      userId: actor.id,
      metadata: { eventId, userId, reason: parsed.data },
    },
  );

  revalidatePath(`/planning/${eventId}`);
  return { error: null };
}
