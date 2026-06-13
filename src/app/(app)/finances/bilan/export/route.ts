import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { getFinancialDashboard } from "@/modules/finance/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

// Montant en euros, virgule décimale (Excel FR).
const eur = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Non authentifié.", { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, roles: true, status: true },
  });
  if (!user || !can(user, "campaign.view")) {
    return new Response("Accès refusé.", { status: 403 });
  }

  const url = new URL(request.url);
  const yearRaw = url.searchParams.get("year");
  const year =
    yearRaw && /^\d{4}$/.test(yearRaw)
      ? Number(yearRaw)
      : new Date().getUTCFullYear();

  const data = await getFinancialDashboard(year);

  const lines: string[] = [];
  lines.push(`Bilan Piloti;${year}`);
  lines.push("");
  lines.push("Mois;Entrées;Sorties");
  for (const m of data.byMonth) {
    lines.push(`${MONTHS[m.month]};${eur(m.inCents)};${eur(m.outCents)}`);
  }
  lines.push("");
  lines.push("Catégorie;Dépenses");
  for (const c of data.byCategory) {
    const label = EXPENSE_CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category;
    lines.push(`${label};${eur(c.cents)}`);
  }
  lines.push("");
  lines.push(`Total encaissé;${eur(data.encaissedCents)}`);
  lines.push(`Total décaissé;${eur(data.disbursedCents)}`);
  lines.push(`Net;${eur(data.netCents)}`);

  // BOM pour qu'Excel ouvre l'UTF-8 correctement.
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bilan-piloti-${year}.csv"`,
      "Cache-Control": "no-cache",
    },
  });
}
