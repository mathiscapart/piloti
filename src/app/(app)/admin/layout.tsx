import { ShieldOff } from "lucide-react";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";

/**
 * Defense in depth — la nav cache déjà les liens admin pour les non-ADMIN,
 * mais on revérifie ici pour bloquer les accès directs à /admin/*.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!can(user, "admin.access")) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <div className="rounded-full bg-brick-soft p-4 text-brick-ink">
          <ShieldOff className="size-8" />
        </div>
        <h1 className="text-2xl font-black text-earth">Accès refusé</h1>
        <p className="text-trail">
          Cette section est réservée aux administrateurs.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
