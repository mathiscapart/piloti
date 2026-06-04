"use client";

import { Bell, Mail, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  deletePushSubscription,
  savePushSubscription,
  updateNotificationPrefs,
} from "@/modules/notifications/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-forest" : "bg-stone",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-snow shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function NotificationSettings({
  emailEnabled: initialEmail,
  pushEnabled: initialPush,
  vapidPublicKey,
}: {
  emailEnabled: boolean;
  pushEnabled: boolean;
  vapidPublicKey: string | null;
}) {
  const [emailEnabled, setEmailEnabled] = useState(initialEmail);
  const [pushEnabled, setPushEnabled] = useState(initialPush);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const pushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const pushConfigured = Boolean(vapidPublicKey);

  // État d'abonnement push sur CET appareil.
  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
  }, [pushSupported]);

  async function persist(next: { emailEnabled: boolean; pushEnabled: boolean }) {
    const res = await updateNotificationPrefs(next);
    if (res.error) toast.error(res.error);
  }

  async function onToggleEmail(next: boolean) {
    setEmailEnabled(next);
    await persist({ emailEnabled: next, pushEnabled });
    toast.success(next ? "Emails activés." : "Emails désactivés.");
  }

  async function onTogglePush(next: boolean) {
    setPushEnabled(next);
    await persist({ emailEnabled, pushEnabled: next });
    toast.success(next ? "Push activé." : "Push désactivé.");
  }

  async function subscribeThisDevice() {
    if (!pushSupported || !vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permission refusée par le navigateur.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSubscribed(true);
      if (!pushEnabled) await onTogglePush(true);
      toast.success("Notifications push activées sur cet appareil.");
    } catch (err) {
      console.error(err);
      toast.error("Impossible d'activer le push sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribeThisDevice() {
    if (!pushSupported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Cet appareil ne recevra plus de push.");
    } catch {
      toast.error("Erreur lors de la désactivation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-trail" />
        <h2 className="font-bold text-earth">Notifications</h2>
      </div>

      {/* Email */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 size-4 shrink-0 text-trail" />
          <div>
            <p className="text-sm font-bold text-earth">Par email</p>
            <p className="text-xs text-trail">
              Recevoir un email pour les nouvelles notifications.
            </p>
          </div>
        </div>
        <Toggle
          checked={emailEnabled}
          onChange={onToggleEmail}
          label="Notifications par email"
        />
      </div>

      <div className="h-px bg-stone/50" />

      {/* Push */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-trail" />
          <div>
            <p className="text-sm font-bold text-earth">Push (navigateur)</p>
            <p className="text-xs text-trail">
              Recevoir une notification même quand Piloti est fermé.
            </p>
          </div>
        </div>
        <Toggle
          checked={pushEnabled}
          onChange={onTogglePush}
          disabled={!pushConfigured}
          label="Notifications push"
        />
      </div>

      {!pushConfigured ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-xs text-trail">
          Le push n&apos;est pas configuré sur le serveur (clés VAPID absentes).
        </p>
      ) : !pushSupported ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-xs text-trail">
          Ce navigateur ne prend pas en charge les notifications push.
        </p>
      ) : subscribed ? (
        <button
          type="button"
          onClick={unsubscribeThisDevice}
          disabled={busy}
          className="text-xs font-bold text-brick hover:underline disabled:opacity-50"
        >
          Désactiver le push sur cet appareil
        </button>
      ) : (
        <button
          type="button"
          onClick={subscribeThisDevice}
          disabled={busy}
          className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-snow transition-colors hover:bg-forest-ink disabled:opacity-50"
        >
          {busy ? "Activation…" : "Activer le push sur cet appareil"}
        </button>
      )}
    </section>
  );
}
