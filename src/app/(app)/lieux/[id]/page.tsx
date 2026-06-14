import {
  ArrowLeft,
  CalendarDays,
  Mail,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Tent,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Stars } from "@/components/camp/Stars";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  CAMP_EQUIPMENT_LABEL,
  type CampEquipment,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import { getPlaceDetail } from "@/modules/camp/places";

import { ArchivePlaceButton } from "./ArchivePlaceButton";
import { ReviewForm } from "./ReviewForm";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const EVENT_DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MODIF_LABEL: Record<string, string> = {
  PLACE_CREATED: "Création",
  PLACE_UPDATED: "Modification",
  PLACE_ARCHIVED: "Archivage",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "place.view")) redirect("/dashboard");

  const data = await getPlaceDetail(id);
  if (!data) notFound();
  const { place } = data;

  const isAdmin = effectiveRoles(user).includes("ADMIN");
  const canManage =
    can(user, "place.manage") && (isAdmin || place.createdById === user.id);
  const canReview = can(user, "place.review");

  const hasCoords = place.latitude != null && place.longitude != null;
  const osmLink = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=15/${place.latitude}/${place.longitude}`
    : null;
  const embedSrc = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${place.longitude! - 0.02},${place.latitude! - 0.012},${place.longitude! + 0.02},${place.latitude! + 0.012}&layer=mapnik&marker=${place.latitude},${place.longitude}`
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/lieux"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux lieux
        </Link>
        {canManage ? (
          <div className="flex gap-1">
            <Button asChild variant="outline" size="sm">
              <Link href={`/lieux/${place.id}/modifier`}>
                <Pencil className="size-4" />
                Modifier
              </Link>
            </Button>
            <ArchivePlaceButton placeId={place.id} name={place.name} />
          </div>
        ) : null}
      </div>

      {/* Photos */}
      {data.photos.length > 0 ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.photos[0]}
            alt={place.name}
            className="aspect-video w-full rounded-2xl object-cover shadow-card"
          />
          {data.photos.length > 1 ? (
            <ul className="grid grid-cols-4 gap-2">
              {data.photos.slice(1).map((url) => (
                <li key={url} className="aspect-square overflow-hidden rounded-xl bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-full object-cover" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Identité */}
      <header className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Tent className="size-3.5" />
          Lieu de camp
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">{place.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-trail">
          {place.region || place.address ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" />
              {[place.region, place.address].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          {place.capacity ? (
            <span className="flex items-center gap-1">
              <Users className="size-4" />
              {place.capacity} pers.
            </span>
          ) : null}
        </div>
        {data.reviewCount > 0 ? (
          <div className="flex items-center gap-2">
            <Stars value={data.avgRating} />
            <span className="text-sm font-bold text-earth">
              {data.avgRating!.toFixed(1)}
            </span>
            <span className="text-sm text-trail">
              · {data.reviewCount} avis
            </span>
          </div>
        ) : null}
      </header>

      {/* Actions rapides */}
      <div className="flex flex-wrap gap-2">
        {osmLink ? (
          <Button asChild variant="outline" size="sm">
            <a href={osmLink} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4" />
              Itinéraire
            </a>
          </Button>
        ) : null}
        {place.ownerPhone ? (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${place.ownerPhone.replace(/\s/g, "")}`}>
              <Phone className="size-4" />
              Appeler le proprio
            </a>
          </Button>
        ) : null}
        {place.ownerEmail ? (
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${place.ownerEmail}`}>
              <Mail className="size-4" />
              Email proprio
            </a>
          </Button>
        ) : null}
      </div>

      {/* Équipements */}
      {data.equipment.length > 0 ? (
        <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Équipements</h2>
          <div className="flex flex-wrap gap-1.5">
            {data.equipment.map((e) => (
              <span
                key={e}
                className="rounded-full bg-forest-soft px-2.5 py-1 text-xs font-medium text-forest-ink"
              >
                {CAMP_EQUIPMENT_LABEL[e as CampEquipment] ?? e}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* Contact propriétaire */}
      {place.ownerName || place.ownerPhone || place.ownerEmail ? (
        <section className="space-y-1 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Contact propriétaire</h2>
          {place.ownerName ? (
            <p className="text-sm text-earth">{place.ownerName}</p>
          ) : null}
          {place.ownerPhone ? (
            <p className="text-sm text-trail">{place.ownerPhone}</p>
          ) : null}
          {place.ownerEmail ? (
            <p className="text-sm text-trail">{place.ownerEmail}</p>
          ) : null}
        </section>
      ) : null}

      {/* Notes pratiques */}
      {place.notes ? (
        <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Notes pratiques</h2>
          <p className="whitespace-pre-wrap text-sm text-earth">{place.notes}</p>
        </section>
      ) : null}

      {/* Localisation (carte OSM embarquée, sans JS) */}
      {embedSrc ? (
        <section className="space-y-2">
          <h2 className="font-bold text-earth">Localisation</h2>
          <iframe
            title={`Carte — ${place.name}`}
            src={embedSrc}
            loading="lazy"
            className="h-64 w-full rounded-2xl border border-stone/40 shadow-card"
          />
        </section>
      ) : null}

      {/* Historique des camps */}
      {data.history.length > 0 ? (
        <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Camps sur ce lieu</h2>
          <ul className="space-y-1.5">
            {data.history.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <CalendarDays className="size-4 shrink-0 text-trail" />
                <Link href={`/planning/${e.id}`} className="font-bold text-earth hover:text-forest">
                  {e.name}
                </Link>
                <span className="text-trail">
                  · {EVENT_DAY_FMT.format(e.startDate)}
                  {e.unit ? ` · ${e.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Avis */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-earth">
          Avis ({data.reviewCount})
        </h2>
        {canReview ? <ReviewForm placeId={place.id} /> : null}
        {data.reviews.length === 0 ? (
          <p className="text-sm text-trail">
            Aucun avis pour le moment. Dépose le premier après ton camp.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.reviews.map((r) => (
              <li key={r.id} className="space-y-1.5 rounded-2xl bg-snow p-4 shadow-card">
                <div className="flex items-center gap-2">
                  {r.author ? (
                    <UserAvatar
                      image={r.author.image}
                      firstName={r.author.firstName}
                      lastName={r.author.lastName}
                      className="size-7"
                    />
                  ) : null}
                  <span className="text-sm font-bold text-earth">
                    {r.author ? `${r.author.firstName} ${r.author.lastName}` : "Chef"}
                  </span>
                  <Stars value={r.rating} size="size-3.5" className="ml-auto" />
                </div>
                {r.comment ? (
                  <p className="whitespace-pre-wrap text-sm text-earth">{r.comment}</p>
                ) : null}
                <p className="text-xs text-trail">{DATE_FMT.format(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* US-L05 — historique des modifications (audit) */}
      {canManage && data.modifications.length > 0 ? (
        <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Historique des modifications</h2>
          <ul className="space-y-1">
            {data.modifications.map((m) => (
              <li key={m.id} className="text-xs text-trail">
                {MODIF_LABEL[m.action] ?? m.action} ·{" "}
                {m.editor ? `${m.editor.firstName} ${m.editor.lastName}` : "—"} ·{" "}
                {DATE_FMT.format(m.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
