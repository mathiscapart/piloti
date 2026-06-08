import { EventEmitter } from "node:events";

// US-C09 — pub/sub en mémoire pour le temps réel (SSE). Mono-instance en prod
// (un seul conteneur Node) → un EventEmitter process-wide suffit pour diffuser
// les événements d'un salon à tous les clients SSE connectés.

export interface ChannelEvent {
  type: "message" | "reaction" | "edit" | "pin" | "delete" | "poll";
  channelId: string;
  // Charge utile sérialisable (id de message, etc.). Le client refetch sur
  // réception ; on n'envoie que de quoi cibler le rafraîchissement.
  payload?: Record<string, unknown>;
}

const globalForRT = globalThis as unknown as {
  __pilotiEmitter?: EventEmitter;
};

// Singleton process-wide stocké sur globalThis — INDISPENSABLE en prod aussi :
// en build standalone, l'action serveur (publish) et la route SSE (subscribe)
// peuvent être dans des bundles distincts. Sans cache global partagé, chacun
// créerait son propre EventEmitter → les événements n'atteignent jamais les
// abonnés (messages non instantanés, notifications jamais reçues). Un seul
// conteneur Node = un seul process = un seul émetteur partagé, ce qui est voulu.
const emitter = globalForRT.__pilotiEmitter ?? new EventEmitter();
emitter.setMaxListeners(0); // beaucoup d'abonnés SSE possibles
globalForRT.__pilotiEmitter = emitter;

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

// ----------------------------------------------------------------------------
// Flux par utilisateur — alimente la cloche de notifications in-app (SSE).
// Un événement signale au client qu'une nouvelle notification est arrivée ; le
// client refetch alors son compteur + sa liste (même pattern que les salons).
// ----------------------------------------------------------------------------

export interface UserEvent {
  // "notification" → rafraîchit la cloche ; "dm" → rafraîchit la messagerie.
  type: "notification" | "dm";
  payload?: Record<string, unknown>;
}

function userTopic(userId: string): string {
  return `user:${userId}`;
}

export function publishUserEvent(userId: string, event: UserEvent): void {
  emitter.emit(userTopic(userId), event);
}

export function subscribeUser(
  userId: string,
  listener: (event: UserEvent) => void,
): () => void {
  const t = userTopic(userId);
  emitter.on(t, listener);
  return () => {
    emitter.off(t, listener);
  };
}
