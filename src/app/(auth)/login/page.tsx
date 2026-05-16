import Link from "next/link";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;

  return (
    <div className="w-full max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-forest">Piloti</h1>
        <p className="mt-2 text-trail">
          Connectez-vous à votre espace de gestion du matériel.
        </p>
      </header>

      {reset === "1" ? (
        <p className="rounded-md border border-forest/30 bg-forest-soft px-3 py-2 text-center text-sm font-medium text-forest-ink">
          Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de
          passe.
        </p>
      ) : null}

      <LoginForm />

      <p className="text-center text-sm text-trail">
        Pas encore de compte ?{" "}
        <Link
          href="/register"
          className="font-bold text-forest underline-offset-4 hover:underline"
        >
          Demander un accès
        </Link>
      </p>
    </div>
  );
}
