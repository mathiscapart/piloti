import "server-only";

import { db } from "@/lib/db";
import { effectiveRoles } from "@/lib/permissions";
import { notify } from "@/modules/notifications/notify";

// US-07 — Alerte retard de retour.
// Détecte les prêts dont la date de retour est dépassée et notifie les
// gestionnaires de matériel (in-app + email selon préférences). Idempotent :
// un (destinataire, prêt) déjà alerté ne l'est plus jamais — la clé de
// déduplication est `Notification.messageId = loan.id`. L'alerte se résout au
// retour (cf. `resolveOverdueNotifications`, appelé depuis `returnLoan`).

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Qui reçoit l'alerte : les comptes qui gèrent les prêts.
const MANAGER_ROLES = ["ADMIN", "CHEF", "RESPONSABLE_MATERIEL"];

/**
 * Parcourt les prêts en retard et envoie une alerte aux gestionnaires qui n'en
 * ont pas encore été notifiés. Renvoie le nombre d'alertes envoyées.
 * Ne jette jamais sur un prêt isolé : c'est `notify()` qui encaisse les échecs.
 */
export async function checkOverdueLoans(): Promise<number> {
  const now = new Date();

  // Prêts en retard : statut RETARD, ou ACTIF dont la date de retour est passée.
  // (Le retard est calculé par article — US-32 : chaque ligne de prêt est
  // évaluée indépendamment.)
  const overdue = await db.loan.findMany({
    where: {
      OR: [
        { status: "RETARD" },
        { AND: [{ status: "ACTIF" }, { expectedReturn: { lt: now } }] },
      ],
    },
    select: {
      id: true,
      expectedReturn: true,
      equipment: { select: { name: true } },
      borrower: { select: { firstName: true, lastName: true } },
    },
  });
  if (overdue.length === 0) return 0;

  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, roles: true },
  });
  const recipients = users.filter((u) =>
    effectiveRoles(u).some((r) => MANAGER_ROLES.includes(r)),
  );
  if (recipients.length === 0) return 0;

  // Déduplication : on ne ré-alerte pas un couple (destinataire, prêt) déjà
  // notifié, quel que soit le nombre de passages du scheduler.
  const loanIds = overdue.map((l) => l.id);
  const existing = await db.notification.findMany({
    where: { type: "LOAN_OVERDUE", messageId: { in: loanIds } },
    select: { userId: true, messageId: true },
  });
  const alreadySent = new Set(
    existing.map((n) => `${n.userId}:${n.messageId}`),
  );

  let sent = 0;
  for (const loan of overdue) {
    const daysLate = Math.floor(
      (now.getTime() - loan.expectedReturn.getTime()) / ONE_DAY_MS,
    );
    const lateLabel =
      daysLate >= 1
        ? `${daysLate} jour${daysLate > 1 ? "s" : ""} de retard`
        : "en retard depuis aujourd'hui";
    const borrower = `${loan.borrower.firstName} ${loan.borrower.lastName}`;
    const body = `${loan.equipment.name} — ${borrower} (${lateLabel}).`;

    for (const u of recipients) {
      if (alreadySent.has(`${u.id}:${loan.id}`)) continue;
      await notify({
        userId: u.id,
        type: "LOAN_OVERDUE",
        title: "Prêt en retard",
        body,
        link: "/prets",
        messageId: loan.id, // clé de déduplication (un alerte par prêt)
      });
      sent++;
    }
  }
  return sent;
}

/**
 * US-07 — l'alerte se résout automatiquement au retour : marque lues les
 * notifications de retard liées à ce prêt (appelé après un retour complet).
 */
export async function resolveOverdueNotifications(loanId: string): Promise<void> {
  await db.notification.updateMany({
    where: { type: "LOAN_OVERDUE", messageId: loanId, readAt: null },
    data: { readAt: new Date() },
  });
}
