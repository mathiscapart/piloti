"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ROLE_LABEL, ROLES, UNIT_LABEL, UNITS, type Role } from "@/lib/enums";
import { approveUser } from "@/modules/admin/actions";

const emptyState = { error: null } as const;

// US-32 — la SECRÉTAIRE attribue tous les rôles sauf ADMIN / Responsable de
// groupe (garde-fou anti-élévation : ces options ne lui sont pas proposées).
const PRIVILEGED_ROLES = new Set<string>(["ADMIN", "RESPONSABLE_GROUPE"]);

interface Props {
  userId: string;
  fullName: string;
  allowPrivileged?: boolean;
  // US-26 — rôle demandé à l'inscription (ex. "PARENT") : pré-sélectionné.
  requestedRole?: string | null;
}

export function ApproveDialog({
  userId,
  fullName,
  allowPrivileged = true,
  requestedRole = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(requestedRole ? [requestedRole] : []),
  );
  const [unit, setUnit] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const visibleRoles = ROLES.filter(
    (r) => allowPrivileged || !PRIVILEGED_ROLES.has(r),
  );

  function toggle(role: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function onSubmit() {
    if (selected.size === 0) {
      setError("Attribue au moins un rôle.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    for (const r of selected) fd.append("role", r);
    fd.set("unit", unit);
    startTransition(async () => {
      const res = await approveUser(emptyState, fd);
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        setSelected(new Set());
        setUnit("");
        toast.success(`${fullName} validé.`);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setSelected(new Set(requestedRole ? [requestedRole] : []));
          setUnit("");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Check className="size-4" />
          Valider
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Valider l&apos;inscription</DialogTitle>
          <DialogDescription>
            {fullName} pourra se connecter avec le(s) rôle(s) choisi(s).
          </DialogDescription>
        </DialogHeader>
        {requestedRole ? (
          <p className="rounded-lg bg-sky-soft px-3 py-2 text-xs font-medium text-sky-ink">
            Inscrit comme <strong>{ROLE_LABEL[requestedRole as Role] ?? requestedRole}</strong> — rôle pré-sélectionné.
          </p>
        ) : null}
        <div className="space-y-2">
          {visibleRoles.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-sand"
            >
              <input
                type="checkbox"
                checked={selected.has(role)}
                onChange={() => toggle(role)}
                className="size-4 accent-forest"
              />
              <span className="text-sm text-earth">
                {ROLE_LABEL[role as Role]}
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`unit-${userId}`} className="text-sm font-bold text-earth">
            Branche / unité
          </label>
          <select
            id={`unit-${userId}`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-lg border border-stone bg-snow px-3 py-2 text-sm text-earth"
          >
            <option value="">Aucune</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Validation…" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
