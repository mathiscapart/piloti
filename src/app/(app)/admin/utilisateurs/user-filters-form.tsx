"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Formulaire GET des filtres. Seul le `<form>` est client : les `<option>` et le
// reste du contenu sont rendus côté serveur et passés en children, ce qui évite
// d'embarquer la liste des rôles et des unités dans le bundle.
//
// Deux comportements :
//   - changer un select filtre immédiatement ; le champ texte attend Entrée ou
//     le bouton (soumettre à chaque frappe rechargerait à chaque lettre) ;
//   - la soumission est interceptée pour devenir une navigation douce. Une
//     soumission GET native recharge tout le document — le proxy rejoue la
//     session, tout le JS est re-parsé — alors que `router.replace` ne redemande
//     que la charge utile RSC de la page.
// `method="GET"` reste déclaré : sans JS, le formulaire fonctionne quand même.
export function UserFiltersForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const navigate = () => {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      const trimmed = String(value).trim();
      // Un filtre vide (« Tous », recherche effacée) sort de l'URL au lieu d'y
      // laisser une clé sans valeur.
      if (trimmed) params.set(key, trimmed);
    }
    const qs = params.toString();
    // `replace` plutôt que `push` : filtrer est un changement de vue, pas une
    // étape de navigation — sinon chaque select empile une entrée d'historique.
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <form
      ref={formRef}
      method="GET"
      role="search"
      aria-label="Recherche et filtres des comptes"
      aria-busy={pending}
      className={cn(className, pending && "opacity-70")}
      onSubmit={(event) => {
        event.preventDefault();
        navigate();
      }}
      onChange={(event) => {
        // React fait remonter `change` à chaque frappe pour un input texte : on
        // ne réagit qu'aux listes déroulantes.
        if (event.target instanceof HTMLSelectElement) navigate();
      }}
    >
      {children}
    </form>
  );
}
