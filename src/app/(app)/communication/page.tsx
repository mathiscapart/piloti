import { MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { listChannelTree } from "@/modules/communication/queries";

import { ChannelSidebar } from "./ChannelSidebar";
import { MessagingTabs } from "./MessagingTabs";

export default async function CommunicationPage() {
  const user = await getCurrentUser();
  const tree = await listChannelTree(user);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-black text-earth md:text-4xl">Messagerie</h1>
        <MessagingTabs active="salons" />
        <p className="text-trail">Salons de discussion du groupe.</p>
      </header>

      {tree.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Aucun salon accessible"
          description="Aucun salon ne t'est ouvert pour le moment."
        />
      ) : (
        <div className="rounded-2xl bg-snow p-4 shadow-card">
          <ChannelSidebar tree={tree} />
        </div>
      )}
    </div>
  );
}
