import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { CurrentUser } from "@/lib/get-current-user";
import type { NotificationSnapshot } from "@/modules/notifications/queries";

import { UserMenu } from "./UserMenu";

export function MobileHeader({
  user,
  notifications,
}: {
  user: CurrentUser;
  notifications: NotificationSnapshot;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-stone/60 bg-snow px-4 md:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo/piloti-icon-clean.svg"
        alt="Piloti"
        width={36}
        height={36}
      />
      <div className="flex items-center gap-1">
        <NotificationBell initial={notifications} compact />
        <UserMenu user={user} compact />
      </div>
    </header>
  );
}
