"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/get-current-user";
import { birthDateSchema } from "@/lib/legal/age";
import type { ActionResult } from "@/lib/types";

// SAFE-01 — complétion obligatoire du profil : la date de naissance est le
// champ qui manque encore sur certains comptes existants (créés avant que le
// champ ne soit systématique) et que `evaluateDmPolicy` traite en fail-safe
// comme « profil incomplet → messagerie bloquée » (dm-policy.ts). Cette action
// permet à l'utilisateur de sortir de cet état lui-même. Même validation que
// l'inscription (`birthDateSchema`, source unique dans lib/legal/age.ts).
const schema = z.object({ birthDate: birthDateSchema });

export async function completeBirthDate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Le compte vient toujours de la session, jamais du FormData.
  const user = await getCurrentUser();

  const parsed = schema.safeParse({ birthDate: formData.get("birthDate") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { birthDate: parsed.data.birthDate },
      }),
    {
      action: "USER_PROFILE_UPDATED",
      userId: user.id,
      metadata: { self: true, birthDateCompleted: true },
    },
  );

  revalidatePath("/completer-profil");
  return { error: null };
}
