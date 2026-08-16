import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { subscribeUser, type UserEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Flux SSE des notifications de l'utilisateur courant. Le client refetch son
// snapshot (compteur + liste) à chaque événement reçu. Auth requise.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // SEC-08 (Vuln 4) — cohérence avec /api/upload et
  // /api/channels/[id]/stream, qui vérifient tous deux le statut du compte
  // en plus de la session.
  const status = (session.user as { status?: string }).status;
  if (status !== "ACTIVE") return new Response("Forbidden", { status: 403 });

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let keepAlive: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: UserEvent | { type: string }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // contrôleur fermé : on ignore
        }
      };

      send({ type: "ready" });
      unsubscribe = subscribeUser(userId, (ev) => send(ev));

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // ignore
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
    cancel() {
      clearInterval(keepAlive);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
