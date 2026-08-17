import { db } from "@/lib/db";
import { can, canActOnUnit, type Action } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

// Périmètre d'unité appliqué à un ÉVÉNEMENT (D-024) — partagé par le planning et
// par le budget, qui est toujours le budget d'un événement.
//
// Un événement dont `unit` est `null` est un événement de GROUPE (cf. schéma) :
// il concerne tout le monde et reste donc ouvert à tout encadrant détenant
// l'action. C'est l'inverse du fail-closed de `inUnitScope`, d'où ce helper
// nommé plutôt qu'un `=== null` recopié à chaque garde.

type ScopeCtx = Parameters<typeof canActOnUnit>[0];

export function canActOnEvent(
  user: ScopeCtx,
  action: Action,
  eventUnit: string | null,
): boolean {
  if (eventUnit === null) return can(user, action); // événement de groupe
  return canActOnUnit(user, action, eventUnit);
}

const HORS_BRANCHE_EVENT = "Cet événement concerne une autre branche.";

/**
 * Garde pour les Server Actions qui ne reçoivent qu'un `eventId` : résout
 * l'unité de l'événement, puis applique le périmètre. Renvoie l'erreur à
 * retourner, ou `null` si l'action peut continuer.
 */
export async function refuseIfEventOutOfScope(
  user: ScopeCtx,
  action: Action,
  eventId: string,
): Promise<ActionResult | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { unit: true },
  });
  if (!event) return { error: "Événement introuvable." };
  return canActOnEvent(user, action, event.unit) ? null : { error: HORS_BRANCHE_EVENT };
}
