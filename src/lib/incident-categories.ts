// Mapping catégorie d'article → types d'incidents disponibles.
// Source : Notion "User Stories — Module Inventaire & Matériel" (US-09).
//
// Convention : identifiants en SNAKE_CASE pour stockage en DB (champ Incident.types JSON).
// Labels FR pour l'UI.

import type { EquipmentCategory } from "@/lib/enums";

export interface IncidentTypeOption {
  value: string;
  label: string;
}

const TENTE_TYPES: IncidentTypeOption[] = [
  { value: "TENTE_PIQUET", label: "Piquet (tordu/manquant/cassé)" },
  { value: "TENTE_ARCEAUX", label: "Arceaux (tordu/cassé/manquant)" },
  { value: "TENTE_TENDEUR", label: "Tendeur (manquant/cassé/usé)" },
  { value: "TENTE_TOILE", label: "Toile (déchirure/trou)" },
  { value: "TENTE_FERMETURE", label: "Fermeture éclair (bloquée/cassée)" },
  { value: "TENTE_SOL", label: "Sol (déchiré/troué)" },
  { value: "TENTE_SARDINE", label: "Sardines (manquantes/tordues)" },
];

const MALLE_TYPES: IncidentTypeOption[] = [
  { value: "MALLE_FERMETURE", label: "Fermeture (cassée/bloquée)" },
  { value: "MALLE_FOND", label: "Fond (fissuré/troué)" },
  { value: "MALLE_POIGNEE", label: "Poignée (arrachée/cassée)" },
  { value: "MALLE_CHARNIERE", label: "Charnière (tordue/manquante)" },
];

const CUISINE_TYPES: IncidentTypeOption[] = [
  { value: "CUISINE_RECHAUD", label: "Réchaud (allumage/valve)" },
  { value: "CUISINE_CASSEROLE", label: "Casserole (fond brûlé/poignée)" },
  { value: "CUISINE_USTENSILE", label: "Ustensile (manquant/cassé)" },
];

const GENERIC_TYPES: IncidentTypeOption[] = [
  { value: "GENERIC_CASSE", label: "Cassé" },
  { value: "GENERIC_MANQUANT", label: "Manquant" },
  { value: "GENERIC_USE", label: "Usé" },
  { value: "GENERIC_AUTRE", label: "Autre (préciser en note)" },
];

export const INCIDENT_TYPES_BY_CATEGORY: Record<
  EquipmentCategory,
  IncidentTypeOption[]
> = {
  TENTE: TENTE_TYPES,
  MALLE: MALLE_TYPES,
  CUISINE: CUISINE_TYPES,
  BIVOUAC: GENERIC_TYPES,
  JEU: GENERIC_TYPES,
  AUTRE: GENERIC_TYPES,
};

// Pour afficher un label depuis un identifiant stocké en DB.
export const INCIDENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  [...TENTE_TYPES, ...MALLE_TYPES, ...CUISINE_TYPES, ...GENERIC_TYPES].map(
    (t) => [t.value, t.label],
  ),
);
