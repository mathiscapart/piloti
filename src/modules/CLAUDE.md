Logique métier par domaine : `queries.ts` (lecture), `*-actions.ts` (Server Actions), `types.ts` (schémas Zod).

- Toute Server Action : `getCurrentUser()` → `can(user, "…")` → validation Zod → `withAudit(...)` → `revalidatePath(...)`.
- Aucune mutation hors `withAudit()` : l'`AuditLog` doit être dans la même transaction Prisma.
- Retour uniformisé `ActionResult` (`{ error }` / succès) consommé par `useActionState` côté client — pas de `throw` vers l'UI.
- Ne jamais faire confiance au `userId` venant du `FormData` : il vient toujours de la session.
- Écrire une nouvelle permission dans `src/lib/permissions.ts` (source unique), jamais un test de rôle en dur.
