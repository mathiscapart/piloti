// Démarrage côté runtime Node, importé par `instrumentation.ts`. Fichier séparé
// pour que le bundle Edge n'analyse pas les API Node (`process.exit`).

export async function registerNode(): Promise<void> {
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
