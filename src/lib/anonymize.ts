import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient; // shorthand, cf. src/lib/audit.ts

// D-028 — remplace le corps d'un message effacé. Volontairement lisible par les
// autres participants : le fil doit rester compréhensible, avec un trou explicite
// plutôt qu'un message disparu sans explication.
const ERASED_BODY = "[Contenu effacé à la demande de son auteur]";

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
 *
 * Les corps de messages écrits par la personne SONT effacés, sauf ceux visés
 * par un signalement — seule exception, motivée par la protection des mineurs
 * (cf. DECISIONS.md D-028). `Report.reason` est conservé pour la même raison :
 * c'est par nature une pièce de modération.
 *
 * ATTENTION en faisant évoluer le schéma : l'effacement est une ANONYMISATION,
 * jamais un `delete` de la ligne `User` — donc aucun `onDelete: Cascade` du
 * schéma ne se déclenche ici. Toute nouvelle table portant de la PII liée à un
 * utilisateur doit être traitée explicitement ci-dessous.
 */
export async function anonymizeUserInTx(tx: Tx, userId: string): Promise<void> {
  // Lu AVANT l'écrasement : sert à purger les jetons de vérification, qui sont
  // indexés par email (`Verification.identifier`) et non par `userId`.
  const before = await tx.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

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

  // Abonnements push : endpoint + clés cryptographiques de l'appareil. La
  // relation porte `onDelete: Cascade`, mais ce cascade ne se déclenche JAMAIS
  // puisqu'on n'efface pas la ligne `User` — sans ce `deleteMany`, l'app
  // pouvait continuer à pousser des notifications vers l'appareil d'une
  // personne effacée.
  await tx.pushSubscription.deleteMany({ where: { userId } });

  // Boîte de notifications de la personne : titres et corps recopient des noms
  // et des contenus de messages. Elle ne sert qu'à son propre destinataire,
  // donc rien n'est perdu pour les autres en la supprimant.
  await tx.notification.deleteMany({ where: { userId } });

  // Jetons de vérification / réinitialisation, indexés par email. Ils expirent
  // seuls, mais `identifier` EST l'adresse email — donc de la PII en clair.
  if (before?.email) {
    await tx.verification.deleteMany({ where: { identifier: before.email } });
  }

  // D-028 — corps des messages écrits par la personne. C'est du texte libre :
  // c'est précisément là qu'on écrit « c'est Marie au 06… ». Le message n'est
  // pas supprimé (le fil des autres participants garderait un trou muet), son
  // contenu est remplacé.
  //
  // SEULE exception : les messages visés par un signalement. Ce sont les
  // uniques preuves dont dispose la modération (SAFE-02) et elles concernent
  // des mineurs — l'intérêt de protection l'emporte ici sur l'effacement.
  const reports = await tx.report.findMany({
    select: { targetType: true, targetId: true },
  });
  const reportedIds = (targetType: string) =>
    reports.filter((r) => r.targetType === targetType).map((r) => r.targetId);

  // `notIn: []` n'est pas un no-op fiable selon les versions de Prisma : on
  // omet la clause plutôt que de passer une liste vide.
  const reportedChannel = reportedIds("CHANNEL_MESSAGE");
  await tx.message.updateMany({
    where: {
      authorId: userId,
      ...(reportedChannel.length > 0 ? { id: { notIn: reportedChannel } } : {}),
    },
    // `attachments` porte des chemins /uploads : laisser une photo jointe en
    // effaçant le texte n'aurait aucun sens, l'image identifie davantage.
    data: { body: ERASED_BODY, attachments: "[]" },
  });

  const reportedDm = reportedIds("DIRECT_MESSAGE");
  await tx.directMessage.updateMany({
    where: {
      senderId: userId,
      ...(reportedDm.length > 0 ? { id: { notIn: reportedDm } } : {}),
    },
    data: { body: ERASED_BODY },
  });
}
