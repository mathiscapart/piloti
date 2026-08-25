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
import {
  CAMP_EQUIPMENT_LABEL,
  type CampEquipment,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import {
  isConsentLinkExpired,
  OWNER_CONSENT_LINK_TTL_DAYS,
} from "@/modules/camp/owner-consent";
import { getPlaceDetail } from "@/modules/camp/places";

import { ArchivePlaceButton } from "./ArchivePlaceButton";
import { EraseOwnerContactButton } from "./EraseOwnerContactButton";
import { ResendOwnerConsentButton } from "./ResendOwnerConsentButton";
import { ReviewForm } from "./ReviewForm";
import { ReviewList } from "./ReviewList";

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
  // RGPD-09 — minimisation : le contact du propriétaire appartient à un TIERS
  // qui n'utilise pas l'app. Consulter le lieu reste ouvert à l'encadrement
  // large ; voir le numéro personnel du propriétaire est réservé à qui organise
  // réellement le camp.
  const canSeeOwner = can(user, "place.owner_contact.view");
  const canEraseOwner = can(user, "place.owner_contact.erase");
  const hasOwnerContact = Boolean(
    place.ownerName || place.ownerPhone || place.ownerEmail,
  );
  // RGPD-09 — le contact n'est utilisable qu'une fois le propriétaire d'accord.
  // Sans validation, il reste stocké mais invisible : une boîte mail morte ne
  // détruit rien, elle rend seulement le contact inexploitable.
  const ownerValidated = place.ownerConsentStatus === "GRANTED";
  const showOwner = canSeeOwner && hasOwnerContact && ownerValidated;
  const ownerPending = canSeeOwner && hasOwnerContact && !ownerValidated;
  // Sans cette indication, un lien mort ne se voit nulle part : le chef croit le
  // propriétaire simplement silencieux, et la relance n'arrive jamais.
  const ownerLinkExpired =
    ownerPending && isConsentLinkExpired(place.ownerConsentRequestedAt);

  // US-L07 — camps tenus ici, proposés au dépôt d'un avis pour que celui-ci
  // porte une branche et une année (sans quoi il n'y aurait rien à filtrer).
  const camps = data.history.map((e) => ({
    id: e.id,
    name: e.name,
    unit: e.unit,
    year: e.startDate.getUTCFullYear(),
  }));

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
        {showOwner && place.ownerPhone ? (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${place.ownerPhone.replace(/\s/g, "")}`}>
              <Phone className="size-4" />
              Appeler le proprio
            </a>
          </Button>
        ) : null}
        {showOwner && place.ownerEmail ? (
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

      {/* RGPD-09 — en attente : on dit qu'un contact existe, sans le montrer. */}
      {ownerPending ? (
        <section className="space-y-2 rounded-2xl border border-dashed border-trail/40 bg-snow p-5">
          <h2 className="font-bold text-earth">Contact propriétaire — en attente</h2>
          <p className="text-sm text-trail">
            Un contact est enregistré pour ce lieu, mais le propriétaire
            n&apos;a pas encore validé son utilisation. Ses coordonnées restent
            masquées jusque-là.
          </p>
          {ownerLinkExpired ? (
            <p className="text-sm font-bold text-brick">
              Le lien envoyé au propriétaire a expiré (
              {OWNER_CONSENT_LINK_TTL_DAYS} jours). Renvoyez-lui-en un nouveau
              pour qu&apos;il puisse répondre.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {place.ownerEmail ? <ResendOwnerConsentButton placeId={place.id} /> : null}
            {canEraseOwner ? (
              <EraseOwnerContactButton placeId={place.id} name={place.name} />
            ) : null}
          </div>
          {!place.ownerEmail ? (
            <p className="text-xs text-trail">
              Aucun email n&apos;est renseigné : informez le propriétaire par un
              autre moyen, en lui transmettant la{" "}
              <a
                href="/information-tiers"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-forest underline-offset-4 hover:underline"
              >
                notice d&apos;information
              </a>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Contact propriétaire — visible seulement si validé (RGPD-09). */}
      {showOwner ? (
        <section className="space-y-1 rounded-2xl bg-snow p-5 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-bold text-earth">Contact propriétaire</h2>
            {canEraseOwner ? (
              <EraseOwnerContactButton placeId={place.id} name={place.name} />
            ) : null}
          </div>
          {place.ownerName ? (
            <p className="text-sm text-earth">{place.ownerName}</p>
          ) : null}
          {place.ownerPhone ? (
            <p className="text-sm text-trail">{place.ownerPhone}</p>
          ) : null}
          {place.ownerEmail ? (
            <p className="text-sm text-trail">{place.ownerEmail}</p>
          ) : null}
          <p className="pt-2 text-xs text-trail">
            Données personnelles d&apos;un tiers, conservées au titre de
            l&apos;intérêt légitime à organiser un camp. Le propriétaire a validé
            leur utilisation et peut en demander l&apos;effacement à tout moment.
          </p>
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

      {/* Avis — US-L07 : filtrables par branche et par année du camp. */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-earth">
          Avis ({data.reviewCount})
        </h2>
        {canReview ? <ReviewForm placeId={place.id} camps={camps} /> : null}
        <ReviewList reviews={data.reviews} />
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
