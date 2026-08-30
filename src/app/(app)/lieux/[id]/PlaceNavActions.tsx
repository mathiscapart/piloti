"use client";

import { ClipboardCopy, Map, Navigation } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// US-L03 — s'y rendre depuis la fiche d'un lieu de camp.
//
// L'ancien bouton « Itinéraire » ouvrait openstreetmap.org avec un simple
// marqueur : aucun calcul de trajet, aucune navigation. On délègue donc au
// service que le chef utilise déjà (Google Maps, Waze, Plans), par de simples
// URL publiques — pas de clé d'API, pas de SDK, et rien à ajouter à la CSP :
// ce sont des navigations sortantes, pas des ressources chargées.
//
// Et surtout le copier-coller, qui reste le seul recours universel : un lieu-dit
// que le géocodeur ignore n'a pas de coordonnées, mais son adresse doit pouvoir
// partir dans un SMS ou l'application du conducteur.

interface Props {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function PlaceNavActions({ name, address, latitude, longitude }: Props) {
  const hasCoords = latitude != null && longitude != null;
  const coords = hasCoords ? `${latitude},${longitude}` : null;

  // Les coordonnées priment sur l'adresse : un terrain de camp est souvent à un
  // lieu-dit qu'aucun service ne sait retrouver (cf. `geocode.ts`). Quand elles
  // manquent, on passe l'adresse en clair et on laisse le service se débrouiller.
  const destination = coords ?? (address ? encodeURIComponent(address) : null);
  if (!destination) return null;

  const targets = [
    {
      label: "Google Maps",
      href: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    },
    {
      label: "Waze",
      href: coords
        ? `https://waze.com/ul?ll=${coords}&navigate=yes`
        : `https://waze.com/ul?q=${destination}&navigate=yes`,
    },
    {
      label: "Plans (Apple)",
      href: `https://maps.apple.com/?daddr=${destination}&dirflg=d`,
    },
  ];

  async function copy(value: string, done: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(done);
    } catch {
      // Contexte non sécurisé ou permission refusée : le presse-papiers n'est
      // pas disponible. On le dit plutôt que de laisser croire à une copie.
      toast.error("Copie impossible — sélectionne le texte à la main.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Navigation className="size-4" />
            Y aller
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {targets.map((t) => (
            <DropdownMenuItem key={t.label} asChild>
              <a href={t.href} target="_blank" rel="noopener noreferrer">
                {t.label}
              </a>
            </DropdownMenuItem>
          ))}
          {hasCoords ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Map className="size-4" />
                  Voir sur OpenStreetMap
                </a>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {address ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy(address, "Adresse copiée.")}
        >
          <ClipboardCopy className="size-4" />
          Copier l&apos;adresse
        </Button>
      ) : null}

      {coords ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy(coords, "Coordonnées copiées.")}
          title={`${name} — ${coords}`}
        >
          <ClipboardCopy className="size-4" />
          Copier les coordonnées
        </Button>
      ) : null}
    </>
  );
}
