import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { getThread } from "@/modules/communication/dm-queries";

import { ThreadView } from "./ThreadView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function ThreadPage({ params }: PageProps) {
  const { userId } = await params;
  const me = await getCurrentUser();
  const thread = await getThread(me.id, userId);
  if (!thread) notFound();

  return <ThreadView initial={thread} />;
}
