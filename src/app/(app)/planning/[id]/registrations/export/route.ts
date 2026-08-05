import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  RSVP_LABEL,
  REGISTRATION_STATUS_LABEL,
  UNIT_LABEL,
  type RegistrationStatus,
  type RsvpResponse,
  type Unit,
} from "@/lib/enums";
import { can } from "@/lib/permissions";
import { getEventWithRegistrations } from "@/modules/planning/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

// US-P05 — export CSV de la liste des inscrits (logistique : effectifs,
// transport, matériel).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Non authentifié.", { status: 401 });
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, roles: true, status: true },
  });
  if (!user || !can(user, "event.manage")) {
    return new Response("Accès refusé.", { status: 403 });
  }

  const data = await getEventWithRegistrations(id, session.user.id);
  if (!data) return new Response("Événement introuvable.", { status: 404 });

  const lines: string[] = [];
  lines.push("Nom;Prénom;Unité;Statut;Réponse;Commentaire;Motif de désistement");
  for (const reg of data.registrations) {
    lines.push(
      [
        esc(reg.user.lastName),
        esc(reg.user.firstName),
        esc(reg.user.unit ? (UNIT_LABEL[reg.user.unit as Unit] ?? reg.user.unit) : ""),
        esc(REGISTRATION_STATUS_LABEL[reg.status as RegistrationStatus] ?? reg.status),
        esc(RSVP_LABEL[reg.response as RsvpResponse] ?? reg.response),
        esc(reg.comment ?? ""),
        esc(reg.withdrawalReason ?? ""),
      ].join(";"),
    );
  }
  for (const u of data.awaiting) {
    lines.push(
      [
        esc(u.lastName),
        esc(u.firstName),
        esc(u.unit ? (UNIT_LABEL[u.unit as Unit] ?? u.unit) : ""),
        esc("En attente"),
        "",
        "",
        "",
      ].join(";"),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inscriptions-${id}.csv"`,
      "Cache-Control": "no-cache",
    },
  });
}
