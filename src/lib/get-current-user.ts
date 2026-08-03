import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Récupère l'utilisateur actuellement connecté avec ses champs Piloti.
 *
 * SEC-08 (Vuln 3/4) — `proxy.ts` ne protège PAS l'invocation directe d'une
 * Server Action (segment dynamique + header Next-Action) : ce n'est pas
 * l'autorité unique. `getCurrentUser()` est le point de passage commun à
 * toutes les Server Actions (communication, DM, finances, planning…), donc
 * c'est ICI que le statut du compte doit être vérifié — pas seulement dans le
 * rendu de page. Un compte PENDING/REJECTED/SUSPENDED ou `canLogin: false`
 * (compte enfant, cf. US-CM-01) ne doit jamais pouvoir exécuter d'action,
 * même avec un cookie de session valide/rejoué.
 */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      roles: true,
      status: true,
      unit: true,
      phone: true,
      image: true,
      // SAFE-01 — nécessaire à `evaluateDmPolicy` (protection des mineurs en
      // messagerie privée) : cf. src/modules/communication/dm-policy.ts.
      birthDate: true,
      canLogin: true,
    },
  });
  if (!user || user.status !== "ACTIVE" || user.canLogin === false) {
    redirect("/login");
  }

  return user;
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
