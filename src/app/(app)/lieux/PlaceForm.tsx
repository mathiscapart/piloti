"use client";

import { Camera, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMP_EQUIPMENT,
  CAMP_EQUIPMENT_LABEL,
  type CampEquipment,
} from "@/lib/enums";
import { createPlace, updatePlace } from "@/modules/camp/place-actions";

const MAX_PHOTOS = 8;

export interface PlaceFormValues {
  id?: string;
  name: string;
  address: string;
  region: string;
  capacity: string;
  equipment: string[];
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  notes: string;
  photos: string[];
}

export function PlaceForm({ initial }: { initial?: PlaceFormValues }) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [pending, start] = useTransition();
  const [equipment, setEquipment] = useState<Set<string>>(
    new Set(initial?.equipment ?? []),
  );
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggleEquip(key: string, on: boolean) {
    setEquipment((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const slots = MAX_PHOTOS - photos.length;
    if (slots <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos.`);
      return;
    }
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(fileList).slice(0, slots)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          toast.error(data.error ?? "Upload échoué.");
          continue;
        }
        uploaded.push(data.url);
      }
    } finally {
      setUploading(false);
    }
    if (uploaded.length > 0) setPhotos((p) => [...p, ...uploaded]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit(fd: FormData) {
    start(async () => {
      if (isEdit) {
        const res = await updatePlace(initial!.id!, fd);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Lieu mis à jour.");
        router.push(`/lieux/${initial!.id}`);
        router.refresh();
      } else {
        const res = await createPlace(fd);
        if (res.error || !res.id) {
          toast.error(res.error ?? "Création impossible.");
          return;
        }
        toast.success("Lieu créé.");
        router.push(`/lieux/${res.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form action={submit} className="space-y-5">
      {/* Hidden inputs : équipements cochés + photos uploadées. */}
      {[...equipment].map((e) => (
        <input key={e} type="hidden" name="equipment" value={e} />
      ))}
      {photos.map((url) => (
        <input key={url} type="hidden" name="photo" value={url} />
      ))}

      <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nom du lieu</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name}
            placeholder="Prairie des Sapins"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            name="address"
            defaultValue={initial?.address}
            placeholder="Lieu-dit, commune, code postal"
          />
          <p className="text-xs text-trail">
            Les coordonnées GPS sont complétées automatiquement à partir de
            l&apos;adresse (pour la carte).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="region">Région / département</Label>
            <Input
              id="region"
              name="region"
              defaultValue={initial?.region}
              placeholder="Savoie"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capacity">Capacité (pers.)</Label>
            <Input
              id="capacity"
              name="capacity"
              inputMode="numeric"
              defaultValue={initial?.capacity}
              placeholder="40"
            />
          </div>
        </div>
      </section>

      {/* Équipements */}
      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Équipements</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CAMP_EQUIPMENT.map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-xl bg-sand/50 px-3 py-2 text-sm text-earth"
            >
              <input
                type="checkbox"
                checked={equipment.has(key)}
                onChange={(e) => toggleEquip(key, e.target.checked)}
                className="size-4 accent-forest"
              />
              {CAMP_EQUIPMENT_LABEL[key as CampEquipment]}
            </label>
          ))}
        </div>
      </section>

      {/* Contact propriétaire */}
      <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Contact propriétaire</h2>
        <div className="space-y-1.5">
          <Label htmlFor="ownerName">Nom</Label>
          <Input id="ownerName" name="ownerName" defaultValue={initial?.ownerName} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ownerPhone">Téléphone</Label>
            <Input
              id="ownerPhone"
              name="ownerPhone"
              type="tel"
              defaultValue={initial?.ownerPhone}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ownerEmail">Email</Label>
            <Input
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              defaultValue={initial?.ownerEmail}
            />
          </div>
        </div>
      </section>

      {/* Photos + notes */}
      <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Photos &amp; notes pratiques</h2>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((url) => (
              <li
                key={url}
                className="group relative aspect-square overflow-hidden rounded-xl bg-sand"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Photo du lieu" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                  aria-label="Retirer cette photo"
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-brick text-snow opacity-90 shadow-card"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || photos.length >= MAX_PHOTOS}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          {uploading ? "Upload…" : `Ajouter des photos (${photos.length}/${MAX_PHOTOS})`}
        </Button>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes pratiques</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={initial?.notes}
            placeholder="Accès, eau, distance des commerces, points de vigilance…"
          />
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || uploading}>
          {pending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le lieu"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
