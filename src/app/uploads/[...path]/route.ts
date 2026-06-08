import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";

// Sert les fichiers uploadés (annonces, photos d'incidents) en les lisant sur
// disque à CHAQUE requête. Indispensable car le serveur Next standalone ne sert
// que les fichiers `public/` présents au DÉMARRAGE : les fichiers ajoutés au
// runtime (uploads) renvoient sinon 404. Accès public mais chemins en UUID
// aléatoire (non devinables) ; protégé contre le path-traversal.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // Anti path-traversal : aucun segment vide, "." ou "..".
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.some((s) => !s || s === "." || s === ".." || s.includes("/") || s.includes("\\"))
  ) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(UPLOADS_DIR, ...segments);
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    const ext = path.extname(filePath).toLowerCase();
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
