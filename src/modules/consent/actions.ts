"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/get-current-user";
import { IMAGE_RIGHTS_VERSION } from "@/lib/legal/versions";
import { IMAGE_RIGHTS_STATUSES } from "@/lib/enums";
import { can } from "@/lib/permissions";

import type { ActionResult } from "@/lib/types";

const setImageRightsSchema = z.object({
  userId: z.string().min(1),
  value: z.enum(IMAGE_RIGHTS_STATUSES),
});

// US-C08 — enregistre le statut de droit à l'image d'un membre. Append-only
// comme le reste de `Consent` : jamais d'update, toujours une nouvelle ligne
// (l'historique complet reste consultable, cf. listImageRightsHistory).
export async function setImageRightsStatus(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!can(actor, "member.image_rights.manage")) {
    return { error: "Action non autorisée." };
  }

  const parsed = setImageRightsSchema.safeParse({
    userId: formData.get("userId"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { userId, value } = parsed.data;

  await withAudit(
    (tx) =>
      tx.consent.create({
        data: {
          userId,
          type: "IMAGE_RIGHTS",
          privacyVersion: IMAGE_RIGHTS_VERSION,
          value,
        },
      }),
    (consent) => ({
      action: "IMAGE_RIGHTS_STATUS_SET",
      userId: actor.id,
      metadata: { targetUserId: userId, value, consentId: consent.id },
    }),
  );

  revalidatePath(`/membres/${userId}`);
  return { error: null };
}
