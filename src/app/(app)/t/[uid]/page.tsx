import { ScanLine } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";

interface PageProps {
  params: Promise<{ uid: string }>;
}

// US-15 — point d'atterrissage d'un scan NFC (ou QR). Le tag encode l'URL
// /t/<uid> ; on résout l'UID vers la fiche article et on redirige.
export default async function NfcResolvePage({ params }: PageProps) {
  const { uid } = await params;
  const decoded = decodeURIComponent(uid).trim();

  const equipment = await db.equipment.findUnique({
    where: { nfcUid: decoded },
    select: { id: true },
  });

  if (equipment) {
    redirect(`/stock/${equipment.id}`);
  }

  // Tag inconnu → proposer d'associer à un article existant.
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-10 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-sand">
        <ScanLine className="size-8 text-trail" />
      </div>
      <h1 className="text-2xl font-black text-earth">Tag non associé</h1>
      <p className="text-trail">
        Ce tag NFC (<code className="font-mono text-earth">{decoded}</code>)
        n&apos;est lié à aucun article. Ouvre la fiche d&apos;un article puis
        utilise « Associer un tag NFC » pour le rattacher.
      </p>
      <Link
        href="/stock"
        className="inline-flex items-center justify-center rounded-full bg-forest px-5 py-2.5 font-bold text-snow transition-colors hover:bg-forest/90"
      >
        Aller au stock
      </Link>
    </div>
  );
}
