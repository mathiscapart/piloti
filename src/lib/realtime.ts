import { EventEmitter } from "node:events";

// US-C09 — pub/sub en mémoire pour le temps réel (SSE). Mono-instance en prod
// (un seul conteneur Node) → un EventEmitter process-wide suffit pour diffuser
// les événements d'un salon à tous les clients SSE connectés.

export interface ChannelEvent {
  type: "message" | "reaction" | "edit" | "pin" | "delete";
  channelId: string;
  // Charge utile sérialisable (id de message, etc.). Le client refetch sur
  // réception ; on n'envoie que de quoi cibler le rafraîchissement.
  payload?: Record<string, unknown>;
}

const globalForRT = globalThis as unknown as {
  __pilotiEmitter?: EventEmitter;
};

const emitter = globalForRT.__pilotiEmitter ?? new EventEmitter();
emitter.setMaxListeners(0); // beaucoup d'abonnés SSE possibles
if (process.env.NODE_ENV !== "production") {
  globalForRT.__pilotiEmitter = emitter;
}

function topic(channelId: string): string {
  return `channel:${channelId}`;
}

export function publishChannelEvent(event: ChannelEvent): void {
  emitter.emit(topic(event.channelId), event);
}

export function subscribeChannel(
  channelId: string,
  listener: (event: ChannelEvent) => void,
): () => void {
  const t = topic(channelId);
  emitter.on(t, listener);
  return () => {
    emitter.off(t, listener);
  };
}
