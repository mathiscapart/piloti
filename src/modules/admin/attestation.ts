// US-CM-01/#96 — date de l'attestation de consentement parental reçue hors
// ligne, saisie par l'admin à la création d'un compte enfant. Hors du fichier
// "use server" d'actions.ts pour être testable sans Prisma.
import { z } from "zod";

import { wallNow } from "@/lib/datetime";

// #188 — `refine`, donc « maintenant » est évalué à chaque validation : le
// `.max(new Date())` précédent le figeait au chargement du module (démarrage
// du serveur). Date saisie = heure murale (minuit UTC du jour, D-046), donc
// comparée à wallNow() et non à new Date().
export const attestationDateSchema = z.coerce
  .date("Date de l'attestation invalide.")
  .min(new Date("1900-01-01"), "Date de l'attestation invalide.")
  .refine(
    (d) => d <= wallNow(),
    "La date de l'attestation ne peut pas être dans le futur.",
  );
