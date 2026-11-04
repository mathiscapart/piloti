// #106 — population d'une campagne de cotisation : les jeunes (rôle SCOUT)
// au compte actif, de l'unité de la campagne, ou de tout le groupe si elle
// n'en a pas. Source unique pour les lignes du suivi, les relances et le
// contrôle des actions du trésorier (paiement, échelonnement, cas social).
// Pur : `campaignPopulationWhere` n'est qu'un préfiltre SQL, la décision est
// `isInCampaignPopulation` (`roles: { contains }` matcherait aussi « SCOUTS »).

import { effectiveRoles } from "@/lib/permissions";

export interface PopulationCandidate {
  status: string;
  roles: string; // JSON string[]
  unit: string | null;
}

export function campaignPopulationWhere(unit: string | null) {
  return {
    status: "ACTIVE",
    roles: { contains: "SCOUT" },
    ...(unit ? { unit } : {}),
  };
}

export function isInCampaignPopulation(
  campaign: { unit: string | null },
  user: PopulationCandidate,
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (campaign.unit && user.unit !== campaign.unit) return false;
  return effectiveRoles(user).includes("SCOUT");
}
