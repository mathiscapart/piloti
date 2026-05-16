import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-forest">Piloti</h1>
        <p className="mt-2 text-trail">Réinitialisation du mot de passe.</p>
      </header>

      <ForgotPasswordForm />

      <p className="text-center text-sm text-trail">
        <Link
          href="/login"
          className="font-bold text-forest underline-offset-4 hover:underline"
        >
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
