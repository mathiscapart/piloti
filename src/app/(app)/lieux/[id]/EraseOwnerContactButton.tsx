"use client";

import { UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { erasePlaceOwnerContact } from "@/modules/camp/place-actions";

/**
 * RGPD-09 — efface le contact du propriétaire, à SA demande.
 *
 * La confirmation nomme explicitement le motif : ce bouton n'est pas un outil
 * de ménage, c'est le seul chemin par lequel un tiers non-utilisateur peut voir
 * son droit à l'effacement honoré. L'action est irréversible et le rappelle.
 */
export function EraseOwnerContactButton({
  placeId,
  name,
}: {
  placeId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function submit() {
    if (
      !window.confirm(
        `Effacer le contact du propriétaire de « ${name} » ?\n\n` +
          "À faire uniquement à la demande du propriétaire (droit à l'effacement). " +
          "Le lieu et ses avis sont conservés ; seuls le nom, le téléphone et " +
          "l'email disparaissent. L'opération est irréversible et tracée.",
      )
    )
      return;
    start(async () => {
      const res = await erasePlaceOwnerContact(placeId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Contact du propriétaire effacé.");
        router.refresh();
      }
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={submit}>
      <UserRoundX className="size-4 text-brick" />
      Effacer le contact
    </Button>
  );
}
