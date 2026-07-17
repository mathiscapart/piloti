import Link from "next/link";

// RGPD-01 — layout sobre pour les pages légales (accessibles sans compte, cf.
// court-circuit dans src/proxy.ts). Logo + contenu + footer de liens croisés.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
      <header className="mb-8 text-center">
        <Link href="/login" className="text-2xl font-black text-forest">
          Piloti
        </Link>
      </header>

      <main className="flex-1 space-y-6 rounded-2xl bg-snow p-6 shadow-card md:p-10">
        {children}
      </main>

      <footer className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-trail">
        <Link href="/mentions-legales" className="underline-offset-4 hover:underline">
          Mentions légales
        </Link>
        <Link href="/confidentialite" className="underline-offset-4 hover:underline">
          Confidentialité
        </Link>
        <Link href="/cgu" className="underline-offset-4 hover:underline">
          CGU
        </Link>
        <Link href="/login" className="font-bold text-forest underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      </footer>
    </div>
  );
}
