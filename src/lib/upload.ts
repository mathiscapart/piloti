import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import sharp from "sharp";

const UPLOAD_ROOT = "public/uploads";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;
// Anti "image bomb" : limite le nombre de pixels acceptés par sharp avant
// décompression. ~25 Mpx (≈5000×5000) couvre les photos de smartphones
// récents et plafonne la mémoire à ~100 Mo en RGBA.
const SHARP_MAX_PIXELS = 25_000_000;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export class UploadError extends Error {}

/**
 * Sauve une photo uploadée :
 *   - Vérifie taille + type MIME.
 *   - Auto-rotate via EXIF, resize ≤1920px, encode WebP q80.
 *   - Écrit dans public/uploads/yyyy/mm/{cuid}.webp.
 *   - Retourne le chemin URL public (`/uploads/...`).
 */
export async function saveUploadedPhoto(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new UploadError("Image trop volumineuse (max 10 Mo).");
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    throw new UploadError(`Format non supporté (${file.type}).`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let webp: Buffer;
  try {
    webp = await sharp(buffer, { limitInputPixels: SHARP_MAX_PIXELS })
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
