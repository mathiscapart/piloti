import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { UPLOAD_ROOT } from "@/lib/upload";

// Sert les fichiers uploadés (annonces, photos d'incidents, justificatifs de
// frais) en les lisant sur disque à CHAQUE requête. Indispensable car le serveur
// Next standalone ne sert que les fichiers `public/` présents au DÉMARRAGE : les
// fichiers ajoutés au runtime (uploads) renvoient sinon 404.
//
// SEC — ces fichiers contiennent des données personnelles (photos de mineurs,
// pièces comptables). Deux protections, en plus de l'anti-path-traversal :
//   1. Session valide exigée. Le nom en UUID v4 n'est PAS un contrôle d'accès :
//      une URL qui fuit (capture d'écran, historique, logs) ne doit pas suffire.
//      `src/proxy.ts` exclut volontairement ce chemin (sinon 307 vers /login et
//      images cassées) : le contrôle se fait donc ICI, pas dans le proxy.
//      Ce contrôle n'est effectif QUE parce que les fichiers sont stockés hors
//      de `public/` (cf. `UPLOAD_ROOT`) : un fichier sous `public/` est servi
//      par le serveur statique de Next sans jamais passer par ce handler.
//   2. Cache privé et non stocké. Un `immutable` d'un an survivait à la
//      suppression du fichier, y compris dans le cache Cloudflare.
// Le contrôle est volontairement grossier (« membre connecté ») : rien en base
// ne relie un chemin de fichier à son entité, donc pas d'autorisation par
// ressource possible sans modèle dédié (cf. DECISIONS.md).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Not found", { status: 404 });

  const { path: segments } = await params;

  // Anti path-traversal : aucun segment vide, "." ou "..".
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.some((s) => !s || s === "." || s === ".." || s.includes("/") || s.includes("\\"))
  ) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(UPLOAD_ROOT, ...segments);
  if (!filePath.startsWith(UPLOAD_ROOT + path.sep)) {
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
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
