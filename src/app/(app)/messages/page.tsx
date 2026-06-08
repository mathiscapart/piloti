import { getCurrentUser } from "@/lib/get-current-user";
import { listContacts, listConversations } from "@/modules/communication/dm-queries";

import { ConversationList } from "./MessagesUI";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  const [conversations, contacts] = await Promise.all([
    listConversations(user.id),
    listContacts(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <ConversationList initial={conversations} contacts={contacts} />
    </div>
  );
}
