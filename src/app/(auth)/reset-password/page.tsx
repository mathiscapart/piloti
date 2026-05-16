import Link from "next/link";

import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="w-full max-w-md space-y-6">
        <header className="text-center">
          <h1 className="text-4xl font-black text-forest">Piloti</h1>
        </header>
        <div className="space-y-3 rounded-2xl bg-snow p-6 shadow-card">
          <p className="font-bold text-brick">Lien invalide ou expiré.</p>
          <p className="text-sm text-trail">
            <Link
              href="/forgot-password"
              className="font-bold text-forest underline-offset-4 hover:underline"
            >
              Demandez un nouveau lien
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-forest">Piloti</h1>
        <p className="mt-2 text-trail">Choisissez un nouveau mot de passe.</p>
      </header>

      <ResetPasswordForm token={token} />

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
