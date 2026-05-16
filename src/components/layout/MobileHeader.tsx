import type { CurrentUser } from "@/lib/get-current-user";

import { UserMenu } from "./UserMenu";

export function MobileHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-stone/60 bg-snow px-4 md:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo/piloti-icon-clean.svg"
        alt="Piloti"
        width={36}
        height={36}
      />
      <UserMenu user={user} compact />
    </header>
  );
}
