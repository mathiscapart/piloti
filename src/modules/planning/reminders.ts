import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/notify";

// US-P06 — relances automatiques d'inscription.
// Pour chaque événement dont la date limite approche, on relance (in-app +
// email selon préférences) les membres concernés qui n'ont PAS encore répondu
// (US-P04) et qui n'ont pas déjà été relancés. La table `EventReminder` sert de
// garde anti-doublon ET de trace « qui a été relancé » côté chef.

// Combien d'heures avant la date limite on déclenche la relance (configurable).
const LEAD_HOURS =
  Number(process.env.REGISTRATION_REMINDER_LEAD_HOURS) || 48;

export async function sendRegistrationReminders(): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + LEAD_HOURS * 3_600_000);

  // Événements ouverts dont la date limite tombe dans la fenêtre [maintenant ;
  // maintenant + LEAD] et n'est pas encore passée.
  const events = await db.event.findMany({
    where: {
      registrationOpen: true,
      registrationDeadline: { gt: now, lte: windowEnd },
    },
    select: { id: true, name: true, unit: true },
  });
  if (events.length === 0) return 0;

  let sent = 0;
  for (const event of events) {
    // Audience : membres de l'unité concernée, ou tout le groupe si non ciblé.
    const recipients = await db.user.findMany({
      where: {
        status: "ACTIVE",
        ...(event.unit ? { unit: event.unit } : {}),
      },
      select: { id: true },
    });
    if (recipients.length === 0) continue;

    const [registered, reminded] = await Promise.all([
      db.eventRegistration.findMany({
        where: { eventId: event.id },
        select: { userId: true },
      }),
      db.eventReminder.findMany({
        where: { eventId: event.id },
        select: { userId: true },
      }),
    ]);
    const excluded = new Set<string>([
      ...registered.map((r) => r.userId),
      ...reminded.map((r) => r.userId),
    ]);

    for (const u of recipients) {
      if (excluded.has(u.id)) continue;
      // On marque la relance AVANT l'envoi : garantit l'anti-doublon même si
      // l'envoi échoue (mieux vaut une relance manquée qu'un spam). L'unique
      // (eventId,userId) absorbe les exécutions concurrentes.
      try {
        await db.eventReminder.create({
          data: { eventId: event.id, userId: u.id },
        });
      } catch {
        continue;
      }
      await notify({
        userId: u.id,
        type: "EVENT_REMINDER",
        title: `Réponds-tu à « ${event.name} » ?`,
        body: `Tu n'as pas encore indiqué ta présence. Réponds avant la date limite.`,
        link: `/planning/${event.id}`,
        messageId: event.id,
      });
      sent++;
    }
  }
  return sent;
}
