// Instrumentation Next.js — exécutée une fois au démarrage du serveur.
// On y démarre le scheduler des tâches périodiques (US-07 : alertes de prêts
// en retard). Uniquement dans le runtime Node (jamais Edge, jamais au build).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
