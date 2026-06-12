"use client";

import { CalendarPlus, Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ensureCalendarToken } from "./actions";

// US-P02 — abonnement iCal au planning (lien personnel à coller dans Google
// Agenda / Apple Calendrier).
export function CalendarSubscription() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function reveal() {
    start(async () => {
      const res = await ensureCalendarToken();
      setUrl(res.url);
    });
  }

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Lien copié.");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const webcal = url ? url.replace(/^https?:\/\//, "webcal://") : null;

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <div>
        <h2 className="font-bold text-earth">Abonnement au calendrier</h2>
        <p className="text-sm text-trail">
          Reçois le planning du groupe dans Google Agenda ou Apple Calendrier —
          il se met à jour automatiquement.
        </p>
      </div>

      {!url ? (
        <Button type="button" size="sm" onClick={reveal} disabled={pending}>
          <CalendarPlus className="size-4" />
          {pending ? "Génération…" : "Afficher mon lien d'abonnement"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>
          {webcal ? (
            <Button asChild size="sm" variant="info">
              <a href={webcal}>S&apos;abonner (Apple Calendrier)</a>
            </Button>
          ) : null}
          <div className="space-y-1 text-xs text-trail">
            <p>
              <span className="font-bold">Google Agenda</span> : « Autres
              agendas » → « À partir de l&apos;URL » → colle ce lien.
            </p>
            <p>
              <span className="font-bold">Apple</span> : bouton ci-dessus, ou
              Réglages → Calendrier → Comptes → Ajouter (Autre) → Abonnement.
            </p>
            <p className="font-medium text-brick-ink">
              ⚠️ Ce lien est personnel — ne le partage pas.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
