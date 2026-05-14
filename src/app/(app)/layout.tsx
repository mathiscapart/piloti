import { BottomNav } from "@/components/layout/BottomNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCurrentUser } from "@/lib/get-current-user";

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

  return (
    <div className="min-h-screen">
      <Sidebar user={user} />
      <div className="flex min-h-screen flex-col md:pl-64">
        <MobileHeader user={user} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
