"use client";

import { ImagePlus, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_AUDIENCE_LABEL } from "@/lib/enums";
import type { ActionResult } from "@/lib/types";
import { createAnnouncement } from "@/modules/communication/announcement-actions";

export function ComposeForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createAnnouncement,
    { error: null },
  );
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [urgent, setUrgent] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) setAttachments((a) => [...a, json.url]);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <form
      action={(fd) => {
        // US-C05 — confirmation explicite avant une diffusion urgente.
        if (
          urgent &&
          !confirm(
            "Diffusion urgente : tous les destinataires seront notifiés (email + push) MÊME s'ils ont coupé leurs notifications. Confirmer l'envoi ?",
          )
        ) {
          return;
        }
        formAction(fd);
      }}
      className="space-y-5 rounded-2xl bg-snow p-5 shadow-card"
    >
      <div className="space-y-1.5">
        <Label htmlFor="title">Titre</Label>
        <Input id="title" name="title" required maxLength={140} placeholder="Sortie de dimanche" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" required rows={5} placeholder="Détaille ton annonce…" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audience">Destinataires</Label>
        <select
          id="audience"
          name="audience"
          defaultValue="ALL"
          className="h-10 w-full rounded-xl border border-stone bg-snow px-3 text-sm text-earth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ANNOUNCEMENT_AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {ANNOUNCEMENT_AUDIENCE_LABEL[a] ?? a}
            </option>
          ))}
        </select>
      </div>

      {/* Pièces jointes */}
      <div className="space-y-2">
        <Label>Pièces jointes</Label>
        <div className="flex flex-wrap items-center gap-2">
          {attachments.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-16 rounded-lg object-cover" />
              <input type="hidden" name="attachments" value={url} />
              <button
                type="button"
                onClick={() => setAttachments((a) => a.filter((u) => u !== url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-brick p-0.5 text-snow"
                aria-label="Retirer"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <label className="flex size-16 cursor-pointer items-center justify-center rounded-lg bg-sand text-trail hover:bg-stone">
            <ImagePlus className="size-5" />
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>
        </div>
        {uploading ? <p className="text-xs text-trail">Envoi de l&apos;image…</p> : null}
      </div>

      {/* Diffusion urgente (US-C05) */}
      <label className="flex items-start gap-3 rounded-xl bg-brick-soft/40 p-3">
        <input
          type="checkbox"
          name="urgent"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="mt-0.5 size-4 accent-brick"
        />
        <span>
          <span className="text-sm font-bold text-brick-ink">Diffusion urgente</span>
          <span className="block text-xs text-trail">
            Force l&apos;email + le push même si le destinataire a coupé ses
            notifications. À réserver aux vraies urgences.
          </span>
        </span>
      </label>

      {state.error ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || uploading}>
        {pending ? "Publication…" : urgent ? "Envoyer en urgent" : "Publier l'annonce"}
      </Button>
    </form>
  );
}
