import { SetupForm } from "./setup-form";

export default function SetupPage() {
  return (
    <div className="w-full max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-forest">Piloti</h1>
        <p className="mt-1 text-sm font-bold uppercase tracking-wider text-trail">
          Premier lancement
        </p>
        <p className="mt-3 text-trail">
          Créez le compte administrateur pour commencer.
        </p>
      </header>

      <SetupForm />
    </div>
  );
}
