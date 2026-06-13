"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCampaignReminders } from "@/modules/finance/campaign-actions";

const DEFAULT_TEMPLATE =
  "Cotisation {campagne} : il reste {reste} à régler. Merci de régulariser.";

export function CampaignReminderSettings({
  campaignId,
  days,
  template,
}: {
  campaignId: string;
  days: string;
  template: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [daysValue, setDaysValue] = useState(days);
  const [tplValue, setTplValue] = useState(template);

  function save() {
    start(async () => {
      const res = await updateCampaignReminders(campaignId, daysValue, tplValue);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Relances mises à jour.");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <div>
        <h2 className="font-bold text-earth">Relances automatiques</h2>
        <p className="text-sm text-trail">
          Les familles non à jour sont relancées après l&apos;échéance, aux
          jours indiqués.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reminderDays">Cadence (jours après l&apos;échéance)</Label>
        <Input
          id="reminderDays"
          value={daysValue}
          onChange={(e) => setDaysValue(e.target.value)}
          placeholder="7, 15, 30"
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reminderTemplate">Modèle de message</Label>
        <Textarea
          id="reminderTemplate"
          value={tplValue}
          onChange={(e) => setTplValue(e.target.value)}
          rows={2}
          placeholder={DEFAULT_TEMPLATE}
        />
        <p className="text-xs text-trail">
          Variables : <code>{"{campagne}"}</code>, <code>{"{reste}"}</code>.
          Laisse vide pour le message par défaut.
        </p>
      </div>
      <Button type="button" size="sm" disabled={pending} onClick={save}>
        {pending ? "Enregistrement…" : "Enregistrer les relances"}
      </Button>
    </section>
  );
}
