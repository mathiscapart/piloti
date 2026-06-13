import { PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listCashBoxes } from "@/modules/finance/cashbox";
import { formatEuros } from "@/modules/finance/format";

import { CashBoxAdmin } from "./CashBoxAdmin";

export default async function CashBoxesPage() {
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");
  const canManage = can(user, "campaign.manage");

  const { boxes, totalCents } = await listCashBoxes();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Wallet className="size-3.5" />
          Finances
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">Caisses</h1>
      </header>

      {boxes.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Aucune caisse"
          description="Crée une caisse (compte principal, caisse de camp…) pour séparer les flux."
        />
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-earth">Soldes</h2>
            <span className="text-sm font-bold text-earth">
              Total {formatEuros(totalCents)}
            </span>
          </div>
          <ul className="space-y-2">
            {boxes.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/finances/caisses/${b.id}`}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-snow p-4 shadow-card transition-colors hover:bg-sand/40"
                >
                  <span className="font-bold text-earth">{b.name}</span>
                  <span
                    className={cn(
                      "font-black tabular-nums",
                      b.balanceCents < 0 ? "text-brick" : "text-earth",
                    )}
                  >
                    {formatEuros(b.balanceCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage ? <CashBoxAdmin boxes={boxes.map((b) => ({ id: b.id, name: b.name }))} /> : null}
    </div>
  );
}
