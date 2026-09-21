import "server-only";

import { db } from "@/lib/db";

import { notify } from "./notify";

/**
 * #147 — prévient le titulaire qu'une série de mots de passe erronés vient de
 * bloquer la connexion à son compte. Forcé (email + push + in-app, quelles que
 * soient les préférences) : c'est une alerte de sécurité, pas une information.
 * Compte inexistant : rien à prévenir.
 */
export async function alertBlockedSignIn(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  await notify({
    userId: user.id,
    type: "SECURITY_ALERT",
    title: "Connexion à votre compte bloquée",
    body:
      "Plusieurs mots de passe erronés ont été saisis pour votre compte Piloti : " +
      "les tentatives de connexion sont bloquées pendant 15 minutes. " +
      "Si c'était vous, patientez ou réinitialisez votre mot de passe. " +
      "Sinon, votre mot de passe n'a pas été trouvé ; changez-le depuis « Mon compte » " +
      "s'il est aussi utilisé ailleurs.",
    link: "/compte",
    force: true,
  });
}
