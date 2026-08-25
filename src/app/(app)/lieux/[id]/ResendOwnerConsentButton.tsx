"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resendOwnerConsentRequest } from "@/modules/camp/owner-consent-actions";

/**
 * RGPD-09 — relance la demande de validation au propriétaire.
 *
 * Sert aux lieux créés avant ce lot (jamais sollicités) et aux messages perdus.
 * Chaque envoi émet un nouveau jeton : l'ancien lien, s'il traînait dans une
 * boîte mail, cesse de fonctionner.
 */
export function ResendOwnerConsentButton({ placeId }: { placeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await resendOwnerConsentRequest(placeId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Demande envoyée au propriétaire.");
        router.refresh();
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={submit}>
      <Send className="size-4" />
      Envoyer la demande
    </Button>
  );
}
