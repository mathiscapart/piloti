// #105 — une caisse ne passe jamais en négatif : un retrait ou un transfert
// sortant est refusé s'il dépasse le solde (dérivé du grand livre, en
// centimes). Vaut pour toutes les caisses, compte bancaire compris. Pur.

import { formatEuros } from "./format";

export function canWithdraw(balanceCents: number, amountCents: number): boolean {
  return amountCents <= balanceCents;
}

export function insufficientBalanceMessage(balanceCents: number): string {
  return `Solde insuffisant : ${formatEuros(balanceCents)} disponibles.`;
}
