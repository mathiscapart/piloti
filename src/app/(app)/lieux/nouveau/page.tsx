import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";

import { PlaceForm } from "../PlaceForm";

export default async function NewPlacePage() {
  const user = await getCurrentUser();
  if (!can(user, "place.create")) redirect("/lieux");

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/lieux"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour aux lieux
      </Link>

      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <MapPin className="size-3.5" />
          Lieux de camp
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          Ajouter un lieu
        </h1>
      </header>

      <PlaceForm />
    </div>
  );
}
