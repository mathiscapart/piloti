import "server-only";

// Scheduler de tâches périodiques côté serveur. Démarré une seule fois par
// l'instrumentation Next (`src/instrumentation.ts`, runtime nodejs).
// Pour l'instant : US-07 — contrôle des prêts en retard (au démarrage + à
// intervalle régulier). Aucun service externe (pas de cron Cloudflare) :
// tout vit dans le process Node de l'app.

// Le flag est posé sur globalThis pour survivre au HMR en dev (sinon chaque
// rechargement de module relancerait un intervalle en doublon).
const globalForScheduler = globalThis as unknown as {
  __pilotiSchedulerStarted?: boolean;
};

// Intervalle par défaut : 6 h. Surchargeable via env (en millisecondes).
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Petit délai au démarrage pour laisser la base / les migrations se stabiliser.
const STARTUP_DELAY_MS = 15_000;

export function startScheduler(): void {
  if (globalForScheduler.__pilotiSchedulerStarted) return;
  globalForScheduler.__pilotiSchedulerStarted = true;

  const intervalMs =
    Number(process.env.OVERDUE_CHECK_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  const run = async () => {
    // Import dynamique : évite de charger Prisma au moment de l'enregistrement
    // de l'instrumentation (et garde ce module léger).
    try {
      const { checkOverdueLoans } = await import("@/modules/inventory/overdue");
      const sent = await checkOverdueLoans();
      if (sent > 0) {
        console.log(`[scheduler] ${sent} alerte(s) de prêt en retard envoyée(s).`);
      }
    } catch (err) {
      console.error("[scheduler] échec du contrôle des prêts en retard:", err);
    }

    try {
      const { sendRegistrationReminders } = await import(
        "@/modules/planning/reminders"
      );
      const reminded = await sendRegistrationReminders();
      if (reminded > 0) {
        console.log(`[scheduler] ${reminded} relance(s) d'inscription envoyée(s).`);
      }
    } catch (err) {
      console.error("[scheduler] échec des relances d'inscription:", err);
    }

    try {
      const { processRecurringTasks, sendTaskReminders } = await import(
        "@/modules/planning/task-scheduler"
      );
      const regenerated = await processRecurringTasks();
      if (regenerated > 0) {
        console.log(`[scheduler] ${regenerated} tâche(s) récurrente(s) régénérée(s).`);
      }
      const taskReminders = await sendTaskReminders();
      if (taskReminders > 0) {
        console.log(`[scheduler] ${taskReminders} rappel(s) de tâche envoyé(s).`);
      }
    } catch (err) {
      console.error("[scheduler] échec du traitement des tâches:", err);
    }
  };

  setTimeout(run, STARTUP_DELAY_MS);
  setInterval(run, intervalMs);

  console.log(
    `[scheduler] contrôle des prêts en retard activé (intervalle ${Math.round(
      intervalMs / 3_600_000,
    )} h).`,
  );
}
