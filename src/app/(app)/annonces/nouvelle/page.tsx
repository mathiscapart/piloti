import { ArrowLeft, Megaphone } from "lucide-react";
import Link from "next/link";

import { ANNOUNCEMENT_AUDIENCES } from "@/lib/enums";
import { requireCan } from "@/lib/require-can";
import { canPublishAnnouncementTo } from "@/modules/communication/audience";

import { ComposeForm } from "./ComposeForm";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  // US-C01/C05 — publication réservée aux encadrants (CHEF / RG / ADMIN).
  const user = await requireCan("announcement.publish");
  // #112 — le formulaire ne propose que les audiences que le serveur acceptera.
  const audiences = ANNOUNCEMENT_AUDIENCES.filter((a) => canPublishAnnouncementTo(user, a));

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/annonces"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Annonces
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black text-earth">
          <Megaphone className="size-7 text-forest" />
          Publier une annonce
        </h1>
        <p className="text-trail">
          Titre, message et destinataires. Les destinataires sont notifiés
          (cloche + email + push).
        </p>
      </header>

      {audiences.length > 0 ? (
        <ComposeForm audiences={audiences} />
      ) : (
        <p className="rounded-2xl bg-snow p-5 text-sm text-trail shadow-card">
          Aucune branche n&apos;est renseignée sur ton compte : demande à un
          administrateur de la compléter pour publier une annonce.
        </p>
      )}
    </div>
  );
}
