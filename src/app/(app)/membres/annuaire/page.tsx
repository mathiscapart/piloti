import { ArrowLeft, Phone, Search, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { listParentDirectory } from "@/modules/inventory/queries";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ParentDirectoryPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser();
  // US-26 — réservé aux responsables de groupe (et admin superutilisateur).
  if (!can(currentUser, "member.directory")) redirect("/dashboard");

  const { q } = await searchParams;
  const search = (q ?? "").trim();
  const parents = await listParentDirectory(search);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour
        </Link>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Annuaire des compétences
        </h1>
        <p className="text-trail">
          Parents mobilisables pour aider le groupe (ayant donné leur
          consentement). Réservé à l&apos;équipe de groupe.
        </p>
      </header>

      <form method="GET" className="relative max-w-xl" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
        <Input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Chercher par profession, compétence, disponibilité…"
          className="pl-9"
        />
      </form>

      {parents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun parent"
          description={
            search
              ? "Aucun parent ne correspond à cette recherche."
              : "Aucun parent n'a encore renseigné et partagé ses compétences."
          }
        />
      ) : (
        <ul className="space-y-3">
          {parents.map((p) => (
            <li key={p.id} className="rounded-2xl bg-snow p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link
                  href={`/membres/${p.id}`}
                  className="font-bold text-earth hover:text-forest"
                >
                  {p.firstName} {p.lastName}
                </Link>
                {p.phone ? (
                  <a
                    href={`tel:${p.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
                  >
                    <Phone className="size-4" />
                    {p.phone}
                  </a>
                ) : null}
              </div>
              {p.profession ? (
                <p className="mt-1 text-sm text-earth">
                  <span className="font-bold">Profession :</span> {p.profession}
                </p>
              ) : null}
              {p.skills ? (
                <p className="text-sm text-earth">
                  <span className="font-bold">Compétences :</span> {p.skills}
                </p>
              ) : null}
              {p.availability ? (
                <p className="text-sm text-trail">
                  <span className="font-bold">Dispos :</span> {p.availability}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
