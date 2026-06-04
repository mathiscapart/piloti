import { ArrowLeft, Gift } from "lucide-react";
import Link from "next/link";

import { DonationForm } from "@/components/donations/DonationForm";
import { getCurrentUser } from "@/lib/get-current-user";
import { listCategories } from "@/modules/inventory/queries";

interface PageProps {
  searchParams: Promise<{ notice?: string }>;
}

export default async function NewDonationPage({ searchParams }: PageProps) {
  const { notice } = await searchParams;
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    listCategories(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-black text-earth">
          <Gift className="size-7 text-forest" />
          Proposer un don
        </h1>
        <p className="text-trail">
          Votre proposition part en validation auprès d&apos;un responsable. Elle
          n&apos;entre dans le stock qu&apos;une fois acceptée.
        </p>
      </header>

      {notice === "donation-submitted" ? (
        <p className="rounded-xl border border-forest/30 bg-forest-soft px-4 py-3 text-sm font-medium text-forest-ink">
          Merci ! Votre proposition de don a bien été envoyée. Un responsable la
          validera prochainement.
        </p>
      ) : null}

      <DonationForm
        categories={categories}
        defaultDonorName={`${user.firstName} ${user.lastName}`}
      />
    </div>
  );
}
