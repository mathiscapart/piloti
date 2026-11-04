import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #188 — la borne « pas dans le futur » doit suivre l'heure courante. Le module
// est importé APRÈS avoir figé l'horloge au démarrage simulé du serveur : une
// borne évaluée au chargement resterait bloquée à cette date.
describe("attestationDateSchema (#188)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });
  afterEach(() => vi.useRealTimers());

  async function loadSchemaAt(serverStart: string) {
    vi.setSystemTime(new Date(serverStart));
    return (await import("./attestation")).attestationDateSchema;
  }

  it("accepte une attestation du jour sur un serveur démarré la veille", async () => {
    const schema = await loadSchemaAt("2026-10-10T08:00:00Z");
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    expect(schema.safeParse("2026-10-12").success).toBe(true);
    expect(schema.safeParse("2026-10-11").success).toBe(true);
  });

  it("refuse une date réellement future", async () => {
    const schema = await loadSchemaAt("2026-10-10T08:00:00Z");
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    const result = schema.safeParse("2026-10-13");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "La date de l'attestation ne peut pas être dans le futur.",
    );
  });

  // Heure murale (D-046) : « 2026-10-12 » saisi est stocké à minuit UTC. À
  // 00:30 à Paris (22:30 UTC la veille, heure d'été), c'est déjà le 12 : la
  // date du jour doit passer, ce qu'une comparaison à new Date() refuserait.
  it("compare en heure murale de Paris, pas à l'instant UTC", async () => {
    const schema = await loadSchemaAt("2026-10-11T22:30:00Z");
    expect(schema.safeParse("2026-10-12").success).toBe(true);
    expect(schema.safeParse("2026-10-13").success).toBe(false);
  });

  // Heure d'hiver (UTC+1) : 22:30 UTC = 23:30 à Paris, encore le 11 ; un
  // décalage figé à +2 h (heure d'été) accepterait à tort le 12.
  it("respecte le décalage d'hiver de Paris au bord de minuit", async () => {
    const schema = await loadSchemaAt("2026-12-11T22:30:00Z");
    expect(schema.safeParse("2026-12-11").success).toBe(true);
    expect(schema.safeParse("2026-12-12").success).toBe(false);
    vi.setSystemTime(new Date("2026-12-11T23:30:00Z"));
    expect(schema.safeParse("2026-12-12").success).toBe(true);
  });

  it("refuse une date invalide ou antérieure à 1900", async () => {
    const schema = await loadSchemaAt("2026-10-12T10:00:00Z");
    expect(schema.safeParse("pas-une-date").success).toBe(false);
    const tooOld = schema.safeParse("1899-12-31");
    expect(tooOld.success).toBe(false);
    expect(tooOld.error?.issues[0]?.message).toBe("Date de l'attestation invalide.");
  });
});
