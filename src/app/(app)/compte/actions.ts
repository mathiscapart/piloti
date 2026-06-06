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

// US-26 — auto-service : l'utilisateur (parent) renseigne lui-même ses
// compétences / disponibilités pour l'annuaire du groupe + consentement RGPD.
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const skillsSchema = z.object({
  profession: optionalText,
  skills: optionalText,
  availability: optionalText,
  helpNotes: optionalText,
  skillsConsent: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean(),
  ),
});

export async function updateOwnSkillsProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();

  const parsed = skillsSchema.safeParse({
    profession: formData.get("profession"),
    skills: formData.get("skills"),
    availability: formData.get("availability"),
    helpNotes: formData.get("helpNotes"),
    skillsConsent: formData.get("skillsConsent"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  await withAudit(
    (tx) => tx.user.update({ where: { id: user.id }, data: parsed.data }),
    {
      action: "USER_PROFILE_UPDATED",
      userId: user.id,
      metadata: { self: true, skills: true },
    },
  );

  revalidatePath("/compte");
  revalidatePath("/membres/annuaire");
  return { error: null };
}
