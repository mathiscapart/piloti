import { auth } from "../src/lib/auth";

// #155 — crée un compte à identifiant (hash du mot de passe + row `Account`
// credential) par le contexte interne de better-auth, comme le fait l'endpoint
// d'inscription, mais sans ses hooks : les comptes des jeux de données ne sont
// pas des inscriptions publiques et ne doivent pas consommer la limite
// anti-bruteforce (#147), qui reste entière pour `/register`. Aucune variable
// ni en-tête ne la désactive.
// Les champs `input: false` (rôles, statut, unité, date de naissance) restent à
// écrire par l'appelant, comme après un `signUpEmail`.
export async function createCredentialUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({
    email: input.email.toLowerCase(),
    name: `${input.firstName} ${input.lastName}`,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user;
}
