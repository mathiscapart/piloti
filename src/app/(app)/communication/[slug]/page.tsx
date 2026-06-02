import { ArrowLeft, Hash } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { effectiveRoles } from "@/lib/permissions";
import { canWriteChannel } from "@/modules/communication/access";
import {
  getChannelForUser,
  listChannelTree,
  listMessages,
} from "@/modules/communication/queries";

import { ChannelSidebar } from "../ChannelSidebar";
import { ChannelView } from "./ChannelView";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChannelPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const channel = await getChannelForUser(user, slug);
  if (!channel) notFound();

  const [messages, tree] = await Promise.all([
    listMessages(channel.id),
    listChannelTree(user),
  ]);

  const isStaff = effectiveRoles(user).some(
    (r) => r === "ADMIN" || r === "CHEF",
  );
  const canWrite = canWriteChannel(user, channel);

  return (
    <div className="mx-auto grid h-[calc(100dvh-4rem)] max-w-6xl grid-cols-1 gap-4 px-2 py-3 md:h-[calc(100dvh-1rem)] md:grid-cols-[16rem_1fr] md:px-6 md:py-4">
      {/* Sidebar desktop */}
      <aside className="hidden overflow-y-auto rounded-2xl bg-snow p-3 shadow-card md:block">
        <Link
          href="/communication"
          className="mb-2 block px-2 text-sm font-bold text-trail hover:text-earth"
        >
          Communication
        </Link>
        <ChannelSidebar tree={tree} activeSlug={slug} />
      </aside>

      {/* Salon */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-snow shadow-card">
        <header className="flex items-center gap-2 border-b border-stone/60 px-4 py-3">
          <Link
            href="/communication"
            className="text-trail hover:text-earth md:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <Hash className="size-4 text-trail" />
          <div className="min-w-0">
            <h1 className="truncate font-bold text-earth">{channel.name}</h1>
            {channel.description ? (
              <p className="truncate text-xs text-trail">
                {channel.description}
              </p>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <ChannelView
            channelId={channel.id}
            initialMessages={messages}
            currentUserId={user.id}
            isStaff={isStaff}
            canWrite={canWrite}
          />
        </div>
      </section>
    </div>
  );
}
