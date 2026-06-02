import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscribeChannel, type ChannelEvent } from "@/lib/realtime";
import { canAccessChannel } from "@/modules/communication/access";

export const dynamic = "force-dynamic";

// US-C09 — flux SSE des événements d'un salon (nouveaux messages, réactions…).
// Le client réagit en refetchant le fil. Auth + contrôle d'accès au salon.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const [user, channel] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, roles: true, unit: true, status: true },
    }),
    db.channel.findUnique({ where: { id } }),
  ]);
  if (!user || user.status !== "ACTIVE" || !channel) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!canAccessChannel(user, channel)) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let keepAlive: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: ChannelEvent | { type: string }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // contrôleur fermé : on ignore
        }
      };

      send({ type: "ready" });
      unsubscribe = subscribeChannel(id, (ev) => send(ev));

      // Commentaire keep-alive pour éviter la fermeture par les proxys.
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
