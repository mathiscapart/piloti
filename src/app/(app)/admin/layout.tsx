import { ShieldOff } from "lucide-react";

import { getCurrentUser } from "@/lib/get-current-user";
import { canAccessAdminZone } from "@/lib/permissions";

/**
 * Defense in depth — la nav cache déjà les liens admin selon le rôle, mais on
 * revérifie ici pour bloquer les accès directs à /admin/*. La zone est ouverte
 * dès qu'au moins une rubrique est accessible (US-32) ; chaque page applique
 * ensuite son propre garde fin.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!canAccessAdminZone(user)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <div className="rounded-full bg-brick-soft p-4 text-brick-ink">
          <ShieldOff className="size-8" />
        </div>
        <h1 className="text-2xl font-black text-earth">Accès refusé</h1>
        <p className="text-trail">
          Tu n&apos;as pas accès à cette section.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
