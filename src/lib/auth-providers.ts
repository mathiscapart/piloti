// Slot pour l'OAuth SGDF national.
// À activer quand l'IdP officiel SGDF sera disponible : décommenter le bloc
// ci-dessous, ajouter les vars d'env (SGDF_OAUTH_CLIENT_ID, SGDF_OAUTH_CLIENT_SECRET,
// SGDF_OAUTH_ISSUER), puis branche `socialProviders` ou `plugins: [genericOAuth(...)]`
// dans `src/lib/auth.ts`.
//
// import { genericOAuth } from "better-auth/plugins";
//
// export const sgdfOAuth = genericOAuth({
//   config: [
//     {
//       providerId: "sgdf",
//       clientId: process.env.SGDF_OAUTH_CLIENT_ID!,
//       clientSecret: process.env.SGDF_OAUTH_CLIENT_SECRET!,
//       authorizationUrl: `${process.env.SGDF_OAUTH_ISSUER}/oauth/authorize`,
//       tokenUrl: `${process.env.SGDF_OAUTH_ISSUER}/oauth/token`,
//       userInfoUrl: `${process.env.SGDF_OAUTH_ISSUER}/oauth/userinfo`,
//       scopes: ["openid", "profile", "email"],
//     },
//   ],
// });

export {};
