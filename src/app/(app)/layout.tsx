import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BottomNav } from "@/components/layout/BottomNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { NoticeHandler } from "@/components/layout/NoticeHandler";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCurrentUser } from "@/lib/get-current-user";
import { getNotificationSnapshot } from "@/modules/notifications/queries";

// SAFE-01 — tout compte ACTIVE sans date de naissance reste en « profil
// incomplet » : dm-policy.ts le bloque déjà en fail-safe côté messagerie. Ce
// verrou l'oblige à la compléter avant d'accéder au reste de l'app.
const COMPLETE_PROFILE_PATH = "/completer-profil";

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

  // SAFE-01 — verrou de profil incomplet. Le proxy transmet le chemin courant
  // en en-tête (x-pathname, cf. src/proxy.ts) pour éviter de boucler sur
  // /completer-profil elle-même.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!user.birthDate && pathname !== COMPLETE_PROFILE_PATH) {
    redirect(COMPLETE_PROFILE_PATH);
  }

  const notifications = await getNotificationSnapshot(user.id);

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <NoticeHandler />
      </Suspense>
      <Sidebar user={user} notifications={notifications} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <MobileHeader user={user} notifications={notifications} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <BottomNav user={user} />
      </div>
    </div>
  );
}
