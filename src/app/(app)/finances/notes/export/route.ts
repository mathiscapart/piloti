import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
  type ExpenseCategory,
  type ExpenseStatus,
} from "@/lib/enums";
import { can } from "@/lib/permissions";
import { listExpenses } from "@/modules/finance/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const eur = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Non authentifié.", { status: 401 });
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, roles: true, status: true },
  });
  if (!user || !can(user, "expense.manage")) {
    return new Response("Accès refusé.", { status: 403 });
  }

  // Par défaut on exporte les notes à rembourser (APPROVED). ?status=all ou
  // processed pour les autres vues.
  const statusRaw = new URL(request.url).searchParams.get("status");
  const all = await listExpenses({ scope: "all", viewerId: session.user.id });
  const filtered =
    statusRaw === "all"
      ? all
      : statusRaw === "processed"
        ? all.filter((e) => e.status !== "PENDING")
        : all.filter((e) => e.status === "APPROVED");

  const lines: string[] = [];
  lines.push("Date;Déclarant;Catégorie;Montant;Statut;Événement;Description");
  for (const e of filtered) {
    lines.push(
      [
        DATE_FMT.format(e.date),
        esc(`${e.declarant.firstName} ${e.declarant.lastName}`),
        EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category,
        eur(e.amountCents),
        EXPENSE_STATUS_LABEL[e.status as ExpenseStatus] ?? e.status,
        esc(e.event?.name ?? ""),
        esc(e.note ?? ""),
      ].join(";"),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notes-de-frais.csv"`,
      "Cache-Control": "no-cache",
    },
  });
}
