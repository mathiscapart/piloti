import { Suspense } from "react";

import { AppFooter } from "@/components/layout/AppFooter";
import { BottomNav } from "@/components/layout/BottomNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { NoticeHandler } from "@/components/layout/NoticeHandler";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCurrentUser } from "@/lib/get-current-user";
import { getNotificationSnapshot } from "@/modules/notifications/queries";

// Force dynamic sur tout le segment (app) : ces pages affichent des données
// utilisateur (incidents, prêts, audit) et doivent toujours être recalculées.
// Sans ça Next 16 prerendere et envoie `Cache-Control: s-maxage=31536000`,
// que Cloudflare cache 1 an → `revalidatePath()` côté serveur ne suffit plus
// (le CDN garde la version périmée).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Layout de l'app authentifiée. Le proxy.ts (Phase 2) a déjà validé
 * session + statut ACTIVE ; ici on monte le chrome (sidebar desktop +
 * mobile header + bottom-nav) et on récupère le user pour le rendu UI.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const notifications = await getNotificationSnapshot(user.id);

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <NoticeHandler />
      </Suspense>
      <Sidebar user={user} notifications={notifications} />
      {/* pb-20 porté par le conteneur et non par <main> : la BottomNav est
          `fixed`, donc hors flux — sans ce padding le AppFooter passerait
          dessous sur mobile. */}
      <div className="flex min-h-screen flex-col pb-20 md:pb-0 md:pl-64">
        <MobileHeader user={user} notifications={notifications} />
        <main className="flex-1">{children}</main>
        <AppFooter />
        <BottomNav user={user} />
      </div>
    </div>
  );
}
