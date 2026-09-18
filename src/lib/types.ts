// Shared types used across modules and components.

/** Standard return type for all Server Actions in this project. */
export interface ActionResult {
  error: string | null;
}

/** Enregistrement d'un paiement : trop-perçu à confirmer explicitement (#121). */
export interface PaymentActionResult extends ActionResult {
  overpaymentCents?: number;
}
