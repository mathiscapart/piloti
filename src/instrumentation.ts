// Instrumentation Next.js — exécutée une fois au démarrage du serveur.
// On y démarre le scheduler des tâches périodiques (US-07 : alertes de prêts
// en retard). Uniquement dans le runtime Node (jamais Edge, jamais au build).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // #163 — une durée de conservation invalide doit empêcher le démarrage,
  // pas faire échouer la purge en silence des heures plus tard. Une exception
  // ne suffit pas : `next start` la journalise mais garde le processus en vie.
  const { auditRetentionYears } = await import("@/lib/audit-retention");
  try {
    auditRetentionYears();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
