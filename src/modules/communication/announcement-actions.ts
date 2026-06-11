"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { UNITS } from "@/lib/enums";
import { can, effectiveRoles } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";
import { resolveUnitAudience } from "@/modules/audience/unit-audience";
import { notifyMany } from "@/modules/notifications/notify";

import { audienceUserIds } from "./audience";
import { getAnnouncementReaders, type ReaderEntry } from "./announcement-queries";

const createSchema = z.object({
  title: z.string().trim().min(1, "Titre requis.").max(140),
  body: z.string().trim().min(1, "Message requis."),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  urgent: z.boolean(),
  attachments: z.array(z.string()).default([]),
});

// Résout les destinataires d'une annonce selon son audience (ACTIVE, hors auteur).
// Pour une branche précise, on inclut désormais les PARENTS des jeunes de la
// branche (via le rattachement familial US-36) en plus de ses membres.
async function resolveRecipients(
  audience: string,
  excludeUserId: string,
): Promise<string[]> {
  if ((UNITS as readonly string[]).includes(audience)) {
    const { allIds } = await resolveUnitAudience(audience);
    return allIds.filter((id) => id !== excludeUserId);
  }
  // "ALL" / "PARENTS" : logique historique (sur la liste des comptes actifs).
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, roles: true, unit: true },
  });
  return audienceUserIds(users, audience, excludeUserId);
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

// US-C03 — marque comme lues les annonces affichées à l'utilisateur (appelé au
// chargement du fil). Idempotent (skipDuplicates). Non audité (volume, dérivé).
export async function markAnnouncementsRead(ids: string[]): Promise<void> {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const user = await getCurrentUser();
  // SQLite ne supporte pas `createMany(skipDuplicates)` via Prisma → upserts
  // idempotents (l'`update` vide préserve le `readAt` de la 1re lecture).
  await Promise.all(
    ids.slice(0, 100).map((announcementId) =>
      db.announcementRead
        .upsert({
          where: { announcementId_userId: { announcementId, userId: user.id } },
          create: { announcementId, userId: user.id },
          update: {},
        })
        .catch(() => {}),
    ),
  );
}

// US-C03 — détail lecteurs / non-lecteurs (pour le dialog). Auteur ou ADMIN.
export async function fetchAnnouncementReaders(
  announcementId: string,
): Promise<ReaderEntry[]> {
  const user = await getCurrentUser();
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId },
    select: { authorId: true },
  });
  if (!announcement) return [];
  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (announcement.authorId !== user.id && !isAdmin) return [];
  return getAnnouncementReaders(announcementId);
}

// US-C03 — relance les destinataires qui n'ont pas lu l'annonce (notification
// ciblée). Réservé à l'auteur ou à un ADMIN.
export async function remindUnreadAnnouncement(
  announcementId: string,
): Promise<ActionResult & { reminded?: number }> {
  const user = await getCurrentUser();
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true, authorId: true, title: true, audience: true },
  });
  if (!announcement) return { error: "Annonce introuvable." };

  const isAdmin = effectiveRoles(user).includes("ADMIN");
  if (announcement.authorId !== user.id && !isAdmin) {
    return { error: "Tu ne peux relancer que tes propres annonces." };
  }

  const recipients = await resolveRecipients(announcement.audience, announcement.authorId);
  const reads = await db.announcementRead.findMany({
    where: { announcementId },
    select: { userId: true },
  });
  const readers = new Set(reads.map((r) => r.userId));
  const unread = recipients.filter((id) => !readers.has(id));
  if (unread.length === 0) return { error: null, reminded: 0 };

  await notifyMany(unread, (userId) => ({
    userId,
    type: "ANNOUNCEMENT",
    title: `🔔 Rappel · ${announcement.title}`,
    body: "Tu n'as pas encore lu cette annonce.",
    link: "/annonces",
  }));

  return { error: null, reminded: unread.length };
}
