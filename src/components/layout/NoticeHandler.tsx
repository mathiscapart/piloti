"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const SUCCESS_MESSAGES: Record<string, string> = {
  "equipment-created": "Article créé.",
  "equipment-updated": "Article mis à jour.",
  "equipment-archived": "Article archivé.",
  "loan-created": "Prêt enregistré.",
  "loan-returned": "Retour validé.",
  "loan-drying": "Article mis en séchage.",
  "incident-reported": "Incident signalé. Merci !",
  "announcement-published": "Annonce publiée.",
  "event-created": "Événement créé.",
  "event-updated": "Événement mis à jour.",
  "event-deleted": "Événement supprimé.",
  "expense-created": "Note de frais envoyée au trésorier.",
  "campaign-created": "Campagne lancée — les familles sont notifiées.",
};

/**
 * Lit `?notice=key` dans l'URL, déclenche un toast sonner, puis nettoie l'URL.
 * Pattern utilisé par les Server Actions qui redirigent après mutation.
 */
export function NoticeHandler() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const notice = params.get("notice");
    if (!notice) return;
    const message = SUCCESS_MESSAGES[notice];
    if (message) toast.success(message);
    const next = new URLSearchParams(params);
    next.delete("notice");
    const url = next.size > 0 ? `${pathname}?${next.toString()}` : pathname;
    router.replace(url, { scroll: false });
  }, [params, pathname, router]);

  return null;
}
