import { z } from "zod";

// Schémas de validation du module « lieux de camp ».

/**
 * RGPD-09 — adresse email d'un propriétaire de lieu.
 *
 * SÉCURITÉ. Ce champ est saisi librement par un chef et sert de destinataire à
 * un envoi réel : sans validation côté serveur, l'application devient un relais
 * capable d'écrire à n'importe quelle adresse. Le `type="email"` du formulaire
 * ne protège de rien — il est purement client et se contourne en une requête.
 *
 * La borne à 254 caractères est celle de la RFC 5321 : au-delà, aucune adresse
 * n'est délivrable, et une chaîne plus longue n'est qu'une charge utile.
 */
export const ownerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Adresse email trop longue.")
  .email("Adresse email du propriétaire invalide.");

/**
 * Normalise, ou renvoie `null` si l'adresse est inexploitable.
 * Un champ vide est légitime (le propriétaire n'a pas forcément d'email) et se
 * distingue donc d'une saisie erronée, que l'appelant doit signaler.
 */
export function parseOwnerEmail(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw?.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = ownerEmailSchema.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Email invalide." };
  }
  return { ok: true, value: parsed.data };
}
