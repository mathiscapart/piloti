"use server";

import { APIError } from "better-auth";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { randomUUID } from "crypto";

import { withAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  enforcePasswordChangeLimit,
  rateLimitMessage,
  recordPasswordChangeOutcome,
} from "@/lib/auth-rate-limit";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { passwordSchema } from "@/lib/password-policy";
import { saveUploadedPhoto, UploadError } from "@/lib/upload";
import { alertBlockedPasswordChange } from "@/modules/notifications/security-alert";

import type { ActionResult } from "@/lib/types";

// US-P02 — renvoie (en la créant au besoin) l'URL d'abonnement iCal de
// l'utilisateur. Le jeton est secret : il vaut authentification pour ce flux.
export async function ensureCalendarToken(): Promise<{ url: string }> {
  const user = await getCurrentUser();
  const current = await db.user.findUnique({
    where: { id: user.id },
    select: { calendarToken: true },
  });

  let token = current?.calendarToken ?? null;
  if (!token) {
    token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
    await withAudit(
      (tx) =>
        tx.user.update({
          where: { id: user.id },
          data: { calendarToken: token },
        }),
      {
        action: "USER_PROFILE_UPDATED",
        userId: user.id,
        metadata: { self: true, calendarToken: "generated" },
      },
    );
  }

  const base = process.env.BETTER_AUTH_URL ?? "";
  return { url: `${base}/api/calendar/${token}.ics` };
}

// Régénère le jeton iCal : l'ancien lien cesse immédiatement de fonctionner.
// Indispensable parce que ce jeton vaut authentification en lecture sur tout le
// planning et voyage en clair dans des URLs (agendas tiers, historique) : sans
// révocation possible, une fuite donnait un accès permanent.
export async function resetCalendarToken(): Promise<{ url: string }> {
  const user = await getCurrentUser();
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");

  await withAudit(
    (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { calendarToken: token },
      }),
    {
      action: "USER_PROFILE_UPDATED",
      userId: user.id,
      metadata: { self: true, calendarToken: "reset" },
    },
  );

  revalidatePath("/compte");
  const base = process.env.BETTER_AUTH_URL ?? "";
  return { url: `${base}/api/calendar/${token}.ics` };
}

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

// Photo de profil — auto-service : l'utilisateur téléverse ou retire son avatar.
// L'image est traitée (resize/WebP) par `saveUploadedPhoto` puis le chemin est
// stocké dans `User.image`. Toute mutation → AuditLog (même transaction).
export async function updateOwnAvatar(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();

  const remove = formData.get("remove") === "1";
  let image: string | null;
  if (remove) {
    image = null;
  } else {
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Aucune image sélectionnée." };
    }
    try {
      image = await saveUploadedPhoto(file);
    } catch (err) {
      return {
        error: err instanceof UploadError ? err.message : "Échec de l'envoi.",
      };
    }
  }

  await withAudit(
    (tx) => tx.user.update({ where: { id: user.id }, data: { image } }),
    {
      action: "USER_PROFILE_UPDATED",
      userId: user.id,
      metadata: { self: true, avatar: remove ? "removed" : "set" },
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

// Changement de mot de passe en auto-service. Passe par le serveur pour
// appliquer `passwordSchema` (même politique qu'à l'inscription) et tracer
// l'opération. better-auth vérifie le mot de passe actuel et écrit le hash.
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mot de passe actuel requis."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Les nouveaux mots de passe ne correspondent pas.",
  });

export async function changeOwnPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { error: "Session expirée." };

  // #153 — sans limite, une session volée permettrait d'essayer autant de mots
  // de passe actuels que voulu, et de retrouver le mot de passe en clair.
  try {
    await enforcePasswordChangeLimit(user.id, requestHeaders);
  } catch (e) {
    const limited = rateLimitMessage(e);
    if (limited) return { error: limited };
    throw e;
  }

  try {
    // Pas de `revokeOtherSessions` : il remplace aussi la session courante, et
    // le re-rendu de /compte qui suit l'action, lancé avec l'ancien cookie,
    // renverrait vers /login. Les autres sessions sont supprimées ci-dessous.
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
      headers: requestHeaders,
    });
  } catch (e) {
    const wrongPassword = e instanceof APIError && e.body?.code === "INVALID_PASSWORD";
    const { locked, alertOwner } = await recordPasswordChangeOutcome(
      user.id,
      requestHeaders,
      wrongPassword ? "failure" : "other",
    );
    if (locked) {
      // #153 — l'essai de cette session vient de bloquer le compte : elle est
      // fermée, et le titulaire est prévenu. `deleteMany` : une requête
      // simultanée a pu la supprimer déjà.
      await withAudit(
        (tx) => tx.session.deleteMany({ where: { id: session.session.id } }),
        {
          action: "USER_SESSION_REVOKED",
          userId: user.id,
          metadata: { reason: "PASSWORD_CHANGE_LOCKED", targetUserId: user.id },
        },
      );
      // Nom et attributs exacts de better-auth : en https, le cookie porte le
      // préfixe `__Secure-`, que la suppression doit reprendre avec `secure`.
      const { name, attributes } = (await auth.$context).authCookies.sessionToken;
      const { path, domain, secure } = attributes;
      (await cookies()).set(name, "", { path, domain, secure, httpOnly: true, maxAge: 0 });
      // Après la réponse : un envoi d'email lent ne retarde pas la redirection.
      if (alertOwner) after(() => alertBlockedPasswordChange(user.id));
      redirect("/login?locked=1");
    }
    if (wrongPassword) return { error: "Mot de passe actuel incorrect." };
    console.error("[changeOwnPassword]", e);
    return { error: "Impossible de changer le mot de passe." };
  }
  await recordPasswordChangeOutcome(user.id, requestHeaders, "success");

  // Le hash est écrit par better-auth, hors de notre transaction. La révocation
  // des autres sessions et l'audit (sans le mot de passe) sont atomiques.
  await withAudit(
    (tx) =>
      tx.session.deleteMany({
        where: { userId: user.id, id: { not: session.session.id } },
      }),
    {
      action: "USER_PASSWORD_CHANGED",
      userId: user.id,
      metadata: { self: true, targetUserId: user.id },
    },
  );

  return { error: null };
}
