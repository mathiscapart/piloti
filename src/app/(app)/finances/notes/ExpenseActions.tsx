"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  REIMBURSEMENT_METHODS,
  REIMBURSEMENT_METHOD_LABEL,
  type ReimbursementMethod,
} from "@/lib/enums";
import {
  approveExpense,
  reimburseExpense,
  rejectExpense,
} from "@/modules/finance/actions";

export function ExpenseActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<ReimbursementMethod>("VIREMENT");

  function run(fn: () => Promise<{ error: string | null }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else {
        toast.success(ok);
        router.refresh();
      }
    });
  }

  if (status === "PENDING") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="success"
          disabled={pending}
          onClick={() => run(() => approveExpense(id), "Note approuvée.")}
        >
          Approuver
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className="text-brick hover:bg-brick-soft hover:text-brick-ink"
          onClick={() => {
            const reason = prompt("Motif du refus :") ?? "";
            if (reason.trim().length === 0) return;
            run(() => rejectExpense(id, reason), "Note refusée.");
          }}
        >
          Refuser
        </Button>
      </div>
    );
  }

  if (status === "APPROVED") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as ReimbursementMethod)}
          disabled={pending}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-earth"
        >
          {REIMBURSEMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {REIMBURSEMENT_METHOD_LABEL[m as ReimbursementMethod]}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="success"
          disabled={pending}
          onClick={() =>
            run(() => reimburseExpense(id, method), "Remboursement enregistré.")
          }
        >
          Marquer remboursée
        </Button>
      </div>
    );
  }

  return null;
}
