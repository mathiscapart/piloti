// #128 — unités encadrées (`UnitLead`) d'un compte après une écriture de ses
// rôles. Règle unique, appliquée par l'approbation, `setUserRoles` et le seed :
// - sans CHEF, aucune unité encadrée (le périmètre suit le rôle) ;
// - CHEF déjà encadrant : rien ne change ;
// - CHEF sans UnitLead : il encadre par défaut son unité d'appartenance, s'il
//   en a une. Sinon aucune (fail-closed), à définir par `setUserLeadUnits`.
export function leadUnitsForRoles(
  roles: readonly string[],
  unit: string | null,
  current: readonly string[],
): string[] {
  if (!roles.includes("CHEF")) return [];
  if (current.length > 0) return [...current];
  return unit ? [unit] : [];
}
