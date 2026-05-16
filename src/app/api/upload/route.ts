import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveUploadedPhoto, UploadError } from "@/lib/upload";

export async function POST(request: Request) {
  // CSRF (S-5) : Same-Origin check. Le cookie est SameSite=Lax, mais on
  // verrouille aussi `Origin`. On *exige* Origin présent et correct ; si
  // absent, on accepte uniquement si Sec-Fetch-Site === same-origin (cas
  // iOS PWA où Origin peut manquer sur fetch same-origin).
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const expectedOrigin =
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const originOk = origin === expectedOrigin;
  const fetchSiteOk = fetchSite === "same-origin";
  if (!originOk && !fetchSiteOk) {
    console.warn("[upload] CSRF reject", { origin, fetchSite, expectedOrigin });
    return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  }

  // Auth : seul un utilisateur ACTIVE peut uploader. Le proxy.ts ne couvre
  // pas /api/* — on revérifie ici.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Compte non actif." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  try {
    const url = await saveUploadedPhoto(file);
    return NextResponse.json({ url });
  } catch (err) {
    const message =
      err instanceof UploadError ? err.message : "Erreur lors de l'upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
