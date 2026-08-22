import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import sharp from "sharp";

// SEC — racine de stockage VOLONTAIREMENT hors de `public/`. Tout fichier
// présent dans `public/` est servi par le serveur de fichiers statiques de Next
// AVANT que la route `/uploads/[...path]` ne s'exécute : le contrôle de session
// de cette route était donc purement décoratif tant que les fichiers vivaient
// là (vérifié en lançant l'app — la réponse portait `ETag`/`Accept-Ranges`,
// jamais posés par notre handler). Sortir les fichiers de `public/` fait de la
// route la SEULE voie d'accès, et rend le contrôle d'accès effectif.
export const UPLOAD_ROOT = join(process.cwd(), "var", "uploads");

/**
 * Traduit une URL publique `/uploads/…` en chemin disque, ou `null` si l'URL
 * n'en est pas une (ou tente une remontée d'arborescence).
 */
export function uploadFsPath(urlPath: string): string | null {
  const prefix = "/uploads/";
  if (!urlPath.startsWith(prefix)) return null;
  const rel = urlPath.slice(prefix.length);
  if (!rel || rel.includes("..")) return null;
  return join(UPLOAD_ROOT, rel);
}
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;
// Anti "image bomb" : limite le nombre de pixels acceptés par sharp avant
// décompression. ~25 Mpx (≈5000×5000) couvre les photos de smartphones
// récents et plafonne la mémoire à ~100 Mo en RGBA.
const SHARP_MAX_PIXELS = 25_000_000;

// SEC — formats réellement acceptés, décidés d'après le contenu du fichier
// (`sharp().metadata().format`) et NON d'après le `Content-Type` annoncé par le
// client, qui est déclaratif et peut être vide (certains navigateurs n'envoient
// aucun type pour un HEIC). Se fier au type déclaré laissait passer n'importe
// quel format vers libvips, dont les décodeurs GIF/TIFF/VIPS ont un historique
// de failles (GHSA-f88m-g3jw-g9cj).
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export class UploadError extends Error {}

/**
 * Sauve une photo uploadée :
 *   - Vérifie taille + format réel du contenu (jamais le type déclaré).
 *   - Auto-rotate via EXIF, resize ≤1920px, encode WebP q80.
 *   - Écrit dans var/uploads/yyyy/mm/{uuid}.webp (hors de `public/`).
 *   - Retourne le chemin URL public (`/uploads/...`).
 */
export async function saveUploadedPhoto(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new UploadError("Image trop volumineuse (max 10 Mo).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  // Lecture de l'en-tête seule (pas de décodage complet) pour identifier le vrai
  // format avant de laisser sharp travailler dessus.
  const pipeline = sharp(buffer, { limitInputPixels: SHARP_MAX_PIXELS });
  let format: string | undefined;
  try {
    ({ format } = await pipeline.metadata());
  } catch {
    throw new UploadError("Impossible de lire l'image.");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new UploadError(`Format non supporté (${format ?? "inconnu"}).`);
  }

  let webp: Buffer;
  try {
    webp = await pipeline
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new UploadError("Impossible de lire l'image.");
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = join(UPLOAD_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.webp`;
  await writeFile(join(dir, filename), webp);

  return `/uploads/${yyyy}/${mm}/${filename}`;
}
