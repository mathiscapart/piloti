import type { CurrentUser } from "@/lib/get-current-user";

import { UserMenu } from "./UserMenu";

export function MobileHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-stone/60 bg-snow px-4 md:hidden">
      <span className="text-xl font-black text-forest">Piloti</span>
      <UserMenu user={user} />
    </header>
  );
}
