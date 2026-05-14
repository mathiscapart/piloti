import Link from "next/link";

import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-forest">Piloti</h1>
        <p className="mt-2 text-trail">
          Créez un compte. Un administrateur le validera avant que vous ne
          puissiez vous connecter.
        </p>
      </header>

      <RegisterForm />

      <p className="text-center text-sm text-trail">
        Déjà un compte ?{" "}
        <Link
          href="/login"
          className="font-bold text-forest underline-offset-4 hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </div>
  );
}
