import "server-only";

import { db } from "@/lib/db";
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { notifyMany } from "@/modules/notifications/notify";

import { formatEuros } from "./format";

// Notifie ceux qui traitent les notes de frais (`expense.manage` : trésoriers,
// RG depuis #173, admin) d'une nouvelle dépense / d'un ticket de caisse —
// remontée automatique à la trésorerie (US-F06 / US-F14).
export async function notifyTreasurers(
  expenseId: string,
  declarant: { id: string; firstName: string; lastName: string },
  amountCents: number,
  category: ExpenseCategory,
): Promise<void> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, role: true, roles: true, status: true },
  });
  const recipients = users
    .filter((u) => can(u, "expense.manage"))
    .map((u) => u.id)
    .filter((id) => id !== declarant.id);
  if (recipients.length === 0) return;

  await notifyMany(recipients, (userId) => ({
    userId,
    type: "EXPENSE_SUBMITTED",
    title: `Note de frais : ${formatEuros(amountCents)}`,
    body: `${declarant.firstName} ${declarant.lastName} — ${EXPENSE_CATEGORY_LABEL[category]}`,
    link: "/finances/notes",
    messageId: expenseId,
  }));
}
