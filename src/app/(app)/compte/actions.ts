"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/get-current-user";

import type { ActionResult } from "@/lib/types";

// US-32 — auto-gestion : un utilisateur édite ses propres coordonnées.
const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis."),
  lastName: z.string().trim().min(1, "Nom requis."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export async function updateOwnProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          name: `${parsed.data.firstName} ${parsed.data.lastName}`,
          phone: parsed.data.phone,
        },
      }),
    {
      action: "USER_PROFILE_UPDATED",
      userId: user.id,
      metadata: { self: true },
    },
  );

  revalidatePath("/compte");
  return { error: null };
}
