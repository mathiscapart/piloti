import { redirect } from "next/navigation";

// La logique d'auth est gérée par `src/proxy.ts` (cookie présent → /dashboard,
// absent → /login). Ce composant ne devrait être atteint qu'en bordure.
export default function RootPage() {
  redirect("/dashboard");
}
