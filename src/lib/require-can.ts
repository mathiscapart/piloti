import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can, type Action } from "@/lib/permissions";

/**
 * Garde de page côté serveur : récupère l'utilisateur courant et vérifie qu'il
 * a la permission `action`. Sinon → redirection /dashboard.
 *
 * À appeler en haut des pages qui exposent des données sensibles (inventaire,
 * prêts, incidents…) afin de ne pas dépendre uniquement du filtrage de nav
 * (UI) ni de la simple présence d'une session ACTIVE.
 */
export async function requireCan(action: Action) {
  const user = await getCurrentUser();
  if (!can(user, action)) redirect("/dashboard");
  return user;
}
