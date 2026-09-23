// RGPD-01/02 — versions des textes légaux. Toute modification substantielle du
// contenu (src/app/(public)/{confidentialite,cgu}) doit s'accompagner d'une
// mise à jour de la date correspondante ici. `Consent.privacyVersion` /
// `Consent.termsVersion` figent la version acceptée par l'utilisateur.
// LEGAL-02 (2026-08-23) — bump des deux textes : les seuils d'âge publiés
// décrivaient l'ancienne règle (compte possible sous 15 ans avec autorisation
// parentale), contredite par US-CM-04 et par l'amendement RGPD-02 du
// 2026-08-08. Conformément à D-014, les comptes existants ne re-consentent pas.
// #140-#142, #144 (2026-09-21) — transferts hors UE, services de push,
// sécurité (confidentialité) et droit applicable (CGU). Évolutions mineures :
// aucun re-consentement (D-014, section « Modification des CGU »).
// #147 (2026-09-21, 2e version du jour) — rétablit « les tentatives de
// connexion répétées sont bloquées », désormais vrai. Évolution mineure :
// aucun re-consentement (D-014).
// #154 (2026-09-21, 3e version du jour) — abonnements push : ce que
// l'interrupteur coupe (pas les messages urgents ni les alertes de sécurité),
// quand l'abonnement est supprimé ; Cloudflare voit les contenus échangés ;
// aucun encadrement des transferts vers les services de push autre que le
// chiffrement du contenu. Évolution mineure : aucun re-consentement (D-014).
// D-037 (2026-09-22) — le texte d'un message de salon modifié ou supprimé est
// conservé dans le journal d'audit. Évolution mineure : aucun re-consentement.
export const PRIVACY_VERSION = "2026-09-22";
export const TERMS_VERSION = "2026-09-21";
export const LEGAL_VERSION = "2026-08-22";

// RGPD-09 — notice aux tiers (/information-tiers). Sa propre date : elle ne
// suit pas les évolutions de la politique de confidentialité.
export const THIRD_PARTY_NOTICE_VERSION = "2026-08-25";

// Une version peut porter un suffixe de révision (« 2026-09-21.3 ») pour rester
// unique dans `Consent.privacyVersion` ; la page n'en affiche que la date.
export function legalVersionDate(version: string): string {
  return version.split(".")[0];
}

// US-C08 — droit à l'image. Même convention : à faire évoluer si le texte/la
// politique de droit à l'image change substantiellement (cf. Consent.type
// IMAGE_RIGHTS, prisma/schema.prisma).
export const IMAGE_RIGHTS_VERSION = "2026-08-01";
