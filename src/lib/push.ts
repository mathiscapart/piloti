import webpush from "web-push";

import { db } from "@/lib/db";

// Web Push (VAPID). Clés dans l'env (jamais NEXT_PUBLIC_ : la clé publique est
// transmise au client via une prop serveur, pas inlinée au build — cf. Docker).
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  → `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                          → mailto:contact@… (recommandé par la spec)

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:noreply@piloti.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

// Envoie un push à tous les abonnements d'un utilisateur. Les endpoints morts
// (404/410) sont purgés. Ne jette jamais : un échec push n'interrompt rien.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Abonnement expiré/révoqué côté navigateur → on le supprime.
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          console.error("[push] échec envoi:", err);
        }
      }
    }),
  );
}
