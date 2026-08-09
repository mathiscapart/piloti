import { CalendarClock } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";

import { CompleteProfileForm } from "./complete-profile-form";

// SAFE-01 — écran de complétion obligatoire : tout compte ACTIVE sans date de
// naissance est redirigé ici par le verrou de src/proxy.ts, tant qu'il n'a pas
// renseigné le champ.
export default async function CompleteProfilePage() {
  // Symétrique du verrou : profil complet → l'écran n'a plus lieu d'être. Sans
  // ça il restait atteignable et affichait « Votre date de naissance n'a pas
  // été renseignée » (faux) avec son formulaire de réécriture. Les deux
  // conditions sont complémentaires : aucune boucle possible.
  const user = await getCurrentUser();
  if (user.birthDate) redirect("/dashboard");


  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <CalendarClock className="size-3.5" />
          Profil à compléter
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          Encore une étape
        </h1>
        <p className="text-trail">
          Votre date de naissance n&apos;a pas été renseignée. Elle est
          nécessaire pour appliquer les bonnes règles de protection des
          mineurs sur l&apos;application (notamment la messagerie privée).
        </p>
      </header>

      <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
        <CompleteProfileForm />
      </section>
    </div>
  );
}
