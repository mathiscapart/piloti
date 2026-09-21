import "server-only";

import { db } from "@/lib/db";

import { notify } from "./notify";

/**
 * #147 — prévient le titulaire qu'une série de mots de passe erronés vient de
 * bloquer la connexion à son compte. Forcé (email + push + in-app, quelles que
 * soient les préférences) : c'est une alerte de sécurité, pas une information.
 * Rien pour un compte inexistant ou qui ne peut pas se connecter (en attente,
 * suspendu, compte enfant) : lui écrire de force n'aurait pas de sens.
 * Le jeton « une alerte par heure » est déjà consommé : si l'envoi échoue, il
 * n'y a pas de nouvelle tentative avant l'heure suivante (limite acceptée).
 */
export async function alertBlockedSignIn(email: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, status: true, canLogin: true },
  });
  if (!user || user.status !== "ACTIVE" || !user.canLogin) return;
  await notify({
    userId: user.id,
    type: "SECURITY_ALERT",
    title: "Tentatives de connexion sur votre compte",
    // Le blocage vise l'appareil (email + IP) à l'origine des essais, pas le
    // compte : ne pas écrire « votre compte est bloqué » ni rassurer à tort.
    body:
      "Plusieurs mots de passe erronés ont été saisis pour votre compte Piloti " +
      "depuis un même appareil, qui a été bloqué temporairement. " +
      "Si c'était vous, patientez quelques minutes ou réinitialisez votre mot de passe. " +
      "Sinon, changez votre mot de passe depuis « Mon compte », surtout s'il est " +
      "utilisé sur un autre site.",
    link: "/compte",
    force: true,
  });
}
