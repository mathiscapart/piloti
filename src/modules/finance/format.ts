// Utilitaires monétaires — montants stockés en centimes (entier).

export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

// Plafond de saisie : 1 000 000 € (100_000_000 centimes). Une trésorerie de
// groupe scout (cotisations, notes de frais, budgets de camp) ne dépasse
// jamais cet ordre de grandeur ; ce plafond attrape surtout une faute de
// frappe (un zéro en trop) avant qu'elle ne parte en base.
const MAX_CENTS = 100_000_000;

// Parse un montant saisi (« 60 », « 60,50 », « 60.5 ») → centiers. null si invalide.
export function parseAmountToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned.length === 0 || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}
