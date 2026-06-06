import { ArrowLeft, Megaphone } from "lucide-react";
import Link from "next/link";

import { requireCan } from "@/lib/require-can";

import { ComposeForm } from "./ComposeForm";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  // US-C01/C05 — publication réservée aux encadrants (CHEF / RG / ADMIN).
  await requireCan("announcement.publish");

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

      <ComposeForm />
    </div>
  );
}
