import Link from "next/link";

import { LICENSE_NAME, LICENSE_URL, SOURCE_URL } from "@/lib/legal/license";

// OSS-01 — pied de page de l'app authentifiée. Deux rôles :
//  1. rendre les pages légales atteignables depuis l'intérieur de l'app — elles
//     n'étaient liées que depuis le formulaire d'inscription et le footer du
//     groupe (public), inaccessible une fois connecté ;
//  2. porter l'offre d'accès au code source exigée par l'AGPL-3.0 §13.
// Aucun contrôle de permission : ces liens sont dus à tous les rôles.
export function AppFooter() {
  return (
    <footer className="mt-8 border-t border-stone/60 px-4 py-6 text-xs text-trail print:hidden">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/mentions-legales" className="underline-offset-4 hover:underline">
          Mentions légales
        </Link>
        <Link href="/confidentialite" className="underline-offset-4 hover:underline">
          Confidentialité
        </Link>
        <Link href="/cgu" className="underline-offset-4 hover:underline">
          CGU
        </Link>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:underline"
        >
          Code source
        </a>
      </nav>

      <p className="mt-3 text-center">
        Piloti — logiciel libre sous licence{" "}
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:underline"
        >
          {LICENSE_NAME}
        </a>
      </p>
    </footer>
  );
}
