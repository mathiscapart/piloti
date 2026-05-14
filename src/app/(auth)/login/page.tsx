import Link from "next/link";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="w-full max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-forest">Piloti</h1>
        <p className="mt-2 text-trail">
          Connectez-vous à votre espace de gestion du matériel.
        </p>
      </header>

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
