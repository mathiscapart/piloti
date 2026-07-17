import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient; // shorthand, cf. src/lib/audit.ts

/**
 * RGPD-04 — effacement réel : anonymise toute la PII d'un compte utilisateur
 * (email, identité, coordonnées, profil parent enrichi) et scrube les champs
 * identifiants du consentement associé, tout en conservant la preuve de
 * consentement (type/version/date). Les prêts/incidents/audit historiques
 * restent intacts (cf. D-011) — seul le lien vers une personne identifiable
 * disparaît.
 *
 * Hors périmètre V1 : les notes pédagogiques (`PedagogicalNote.content`) ne
 * sont pas nettoyées, ni le texte libre `Equipment.notes` recopiant un nom de
 * donateur (cf. DECISIONS.md D-011).
 */
export async function anonymizeUserInTx(tx: Tx, userId: string): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      status: "DELETED",
      email: `deleted+${userId}@piloti.invalid`,
      name: "Compte supprimé",
      firstName: "Compte",
      lastName: "supprimé",
      phone: null,
      birthDate: null,
      image: null,
      rejectedReason: null,
      calendarToken: null,
      profession: null,
      skills: null,
      availability: null,
      helpNotes: null,
      skillsConsent: false,
    },
  });

  // Preuve du consentement conservée (type/version/date) ; identifiants scrubés.
  await tx.consent.updateMany({
    where: { userId },
    data: {
      guardianName: null,
      ipAddress: null,
      userAgent: null,
    },
  });

  // Snapshot du nom du contact de séchage (Loan.dryingPersonName) — scrubé au
  // même titre que le reste de la PII.
  await tx.loan.updateMany({
    where: { dryingContactId: userId },
    data: { dryingPersonName: "Compte supprimé" },
  });

  // Snapshot du nom du donateur (Donation.donorName) — idem. Le texte libre
  // `Equipment.notes` ("Don de X") n'est volontairement pas nettoyé (résidu
  // connu, cf. DECISIONS.md D-011).
  await tx.donation.updateMany({
    where: { donorId: userId },
    data: { donorName: "Compte supprimé" },
  });
}
