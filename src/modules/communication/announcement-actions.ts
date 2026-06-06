"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { notifyMany } from "@/modules/notifications/notify";

const createSchema = z.object({
  title: z.string().trim().min(1, "Titre requis.").max(140),
  body: z.string().trim().min(1, "Message requis."),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  urgent: z.boolean(),
  attachments: z.array(z.string()).default([]),
});

interface RecipientUser {
  id: string;
  role: string;
  roles: string | string[] | null;
  unit: string | null;
}

// Résout les destinataires d'une annonce selon son audience (ACTIVE, hors auteur).
async function resolveRecipients(
  audience: string,
  excludeUserId: string,
): Promise<string[]> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, roles: true, unit: true },
  });
  const match = (u: RecipientUser) => {
    if (audience === "ALL") return true;
    if (audience === "PARENTS") return effectiveRoles(u).includes("PARENT");
    return u.unit === audience; // une branche précise
  };
  return users.filter((u) => u.id !== excludeUserId && match(u)).map((u) => u.id);
}

// US-C01 / US-C05 — publie une annonce et notifie les destinataires (in-app +
// email + push ; `urgent` force la diffusion en contournant les préférences).
export async function createAnnouncement(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "announcement.publish")) {
    return { error: "Tu n'as pas le droit de publier une annonce." };
  }

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    audience: formData.get("audience"),
    urgent: formData.get("urgent") === "on" || formData.get("urgent") === "true",
    attachments: formData.getAll("attachments").map(String).filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { title, body, audience, urgent, attachments } = parsed.data;

  const announcement = await withAudit(
    (tx) =>
      tx.announcement.create({
        data: {
          authorId: user.id,
          title,
          body,
          audience,
          urgent,
          attachments: JSON.stringify(attachments),
        },
      }),
    {
      action: "ANNOUNCEMENT_PUBLISHED",
      userId: user.id,
      metadata: { title, audience, urgent },
    },
  );

  // Fan-out notifications (fire-and-forget géré par notify, mais on attend ici
  // car l'action redirige juste après — la boucle est courte pour un groupe).
  const recipients = await resolveRecipients(audience, user.id);
  await notifyMany(recipients, (userId) => ({
    userId,
    type: "ANNOUNCEMENT",
    title: `${urgent ? "🚨 URGENT" : "📣 Annonce"} · ${title}`,
    body: body.slice(0, 160),
    link: "/annonces",
    force: urgent, // US-C05 — contourne les préférences du destinataire
  }));

  void announcement;
  redirect("/annonces?notice=announcement-published");
}

const idSchema = z.object({ id: z.string().min(1) });

// Suppression — auteur ou ADMIN (US-C01 : supprimable par son auteur).
export async function deleteAnnouncement(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Identifiant invalide." };

  const announcement = await db.announcement.findUnique({
    where: { id: parsed.data.id },
    select: { authorId: true, title: true },
  });
  if (!announcement) return { error: "Annonce introuvable." };

  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (announcement.authorId !== user.id && !isAdmin) {
    return { error: "Tu ne peux supprimer que tes propres annonces." };
  }

  await withAudit(
    (tx) => tx.announcement.delete({ where: { id: parsed.data.id } }),
    {
      action: "ANNOUNCEMENT_DELETED",
      userId: user.id,
      metadata: { announcementId: parsed.data.id, title: announcement.title },
    },
  );

  revalidatePath("/annonces");
  return { error: null };
}
