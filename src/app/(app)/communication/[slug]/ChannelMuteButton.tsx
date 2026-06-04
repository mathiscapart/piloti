"use client";

import { Bell, BellOff } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { toggleChannelMute } from "@/modules/notifications/actions";

// US-C09 — couper/réactiver les notifications de ce salon (le salon reste lisible).
export function ChannelMuteButton({
  channelId,
  initialMuted,
}: {
  channelId: string;
  initialMuted: boolean;
}) {
  const [muted, setMuted] = useState(initialMuted);
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await toggleChannelMute(channelId);
      setMuted(res.muted);
      toast.success(res.muted ? "Salon mis en sourdine." : "Notifications réactivées.");
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={muted ? "Réactiver les notifications" : "Mettre en sourdine"}
      title={muted ? "Réactiver les notifications" : "Mettre en sourdine"}
      className={cn(
        "rounded-full p-2 transition-colors hover:bg-sand disabled:opacity-50",
        muted ? "text-brick" : "text-trail",
      )}
    >
      {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
    </button>
  );
}
