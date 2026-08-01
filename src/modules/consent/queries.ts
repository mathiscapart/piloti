import "server-only";

import { db } from "@/lib/db";
import type { ImageRightsStatus } from "@/lib/enums";

// US-C08 — droit à l'image. `Consent` est append-only (RGPD-02) : jamais
// d'update, jamais de suppression. L'état courant est donc la ligne
// IMAGE_RIGHTS la plus récente (`acceptedAt` desc) pour ce membre.

// Dernier statut connu, ou `null` si jamais renseigné — à distinguer côté UI
// d'un statut "NON" (refusé) : `null` = pas encore demandé.
export async function getImageRightsStatus(
  userId: string,
): Promise<ImageRightsStatus | null> {
  const last = await db.consent.findFirst({
    where: { userId, type: "IMAGE_RIGHTS" },
    orderBy: { acceptedAt: "desc" },
    select: { value: true },
  });
  return (last?.value as ImageRightsStatus | undefined) ?? null;
}

// Historique complet (traçabilité) — qui a changé le statut et quand.
export async function listImageRightsHistory(userId: string) {
  return db.consent.findMany({
    where: { userId, type: "IMAGE_RIGHTS" },
    orderBy: { acceptedAt: "desc" },
    select: { id: true, value: true, acceptedAt: true, privacyVersion: true },
  });
}

export type ImageRightsHistoryEntry = Awaited<
  ReturnType<typeof listImageRightsHistory>
>[number];
