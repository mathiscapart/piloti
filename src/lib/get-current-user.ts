import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Récupère l'utilisateur actuellement connecté avec ses champs Piloti.
 * Le proxy.ts a déjà validé session + statut ACTIVE — ici on remonte juste
 * le user pour le rendu UI. Si la session est null (cas pathologique post-proxy),
 * redirect /login.
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
      status: true,
      unit: true,
      phone: true,
    },
  });
  if (!user) redirect("/login");

  return user;
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
