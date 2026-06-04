"use client";

import { KeyRound, Pause, Play, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  changeUserPassword,
  deleteUser,
  reactivateUser,
  setUserRoles,
  setUserUnit,
  suspendUser,
} from "@/modules/admin/actions";
import { ROLE_LABEL, ROLES, UNIT_LABEL, UNITS, type Role } from "@/lib/enums";

const emptyState = { error: null } as const;

// US-32 — éditeur de rôles UNIFIÉ : un compte porte n'importe quelle
// combinaison de rôles du catalogue complet (ex. juste « Trésorier »).
// `allowPrivileged` : seul l'ADMIN peut attribuer ADMIN / Responsable de groupe
// (garde-fou anti-élévation ; la SECRÉTAIRE ne voit pas ces options).
const PRIVILEGED_ROLES = new Set<string>(["ADMIN", "RESPONSABLE_GROUPE"]);

export function RolesEditor({
  userId,
  currentRoles,
  allowPrivileged = true,
}: {
  userId: string;
  currentRoles: string[];
  allowPrivileged?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(currentRoles),
  );
  const [pending, start] = useTransition();

  // Catalogue attribuable : sans ADMIN/RG si l'acteur n'est pas ADMIN, sauf si
  // le compte cible les porte déjà (on les affiche alors en lecture, cochés).
  const visibleRoles = ROLES.filter(
    (r) => allowPrivileged || !PRIVILEGED_ROLES.has(r) || currentRoles.includes(r),
  );

  function toggle(role: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function save() {
    const fd = new FormData();
    fd.set("userId", userId);
    for (const r of selected) fd.append("roles", r);
    start(async () => {
      const res = await setUserRoles(emptyState, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Rôles mis à jour.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  const count = currentRoles.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Rôles{count > 0 ? ` (${count})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rôles du compte</DialogTitle>
          <DialogDescription>
            Coche tous les rôles de la personne (n&apos;importe quelle
            combinaison ; ex. juste « Trésorier »).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {visibleRoles.map((role) => {
            // Rôle sensible affiché à un acteur non-admin (car déjà porté) :
            // visible mais verrouillé.
            const locked = !allowPrivileged && PRIVILEGED_ROLES.has(role);
            return (
              <label
                key={role}
                className={cn(
                  "flex items-center gap-2 rounded-lg p-2",
                  locked
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-sand",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(role)}
                  onChange={() => toggle(role)}
                  disabled={locked}
                  className="size-4 accent-forest"
                />
                <span className="text-sm text-earth">
                  {ROLE_LABEL[role as Role]}
                </span>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// US-32 — éditeur d'unité/branche (ADMIN + SECRÉTAIRE). "" = aucune unité.
const UNIT_SHORT: Record<string, string> = {
  BLEUS: "Bleus",
  VERTS: "Verts",
  ROUGES: "Rouges",
  PIOS: "Pios",
  COMPAS: "Compas",
  VIOLETS: "Violets",
};

export function UnitEditor({
  userId,
  currentUnit,
}: {
  userId: string;
  currentUnit: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(currentUnit ?? "");
  const [pending, start] = useTransition();

  function save() {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("unit", selected);
    start(async () => {
      const res = await setUserUnit(emptyState, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Unité mise à jour.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSelected(currentUnit ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {currentUnit ? (UNIT_SHORT[currentUnit] ?? currentUnit) : "Unité —"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Unité / branche</DialogTitle>
          <DialogDescription>
            Choisis la branche de la personne (ou « Aucune »).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-sand">
            <input
              type="radio"
              name={`unit-${userId}`}
              checked={selected === ""}
              onChange={() => setSelected("")}
              className="size-4 accent-forest"
            />
            <span className="text-sm text-earth">Aucune unité</span>
          </label>
          {UNITS.map((u) => (
            <label
              key={u}
              className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-sand"
            >
              <input
                type="radio"
                name={`unit-${userId}`}
                checked={selected === u}
                onChange={() => setSelected(u)}
                className="size-4 accent-forest"
              />
              <span className="text-sm text-earth">{UNIT_LABEL[u]}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SuspendButton({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handle() {
    if (!confirm(`Suspendre ${fullName} ? Ses sessions actives seront tuées.`))
      return;
    const fd = new FormData();
    fd.set("userId", userId);
    start(async () => {
      const res = await suspendUser(emptyState, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`${fullName} suspendu.`);
        router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={handle}
      disabled={pending}
    >
      <Pause className="size-4" />
      {pending ? "…" : "Suspendre"}
    </Button>
  );
}

export function ReactivateButton({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handle() {
    const fd = new FormData();
    fd.set("userId", userId);
    start(async () => {
      const res = await reactivateUser(emptyState, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`${fullName} réactivé.`);
        router.refresh();
      }
    });
  }

  return (
    <Button type="button" size="sm" onClick={handle} disabled={pending}>
      <Play className="size-4" />
      {pending ? "…" : "Réactiver"}
    </Button>
  );
}

export function DeleteUserButton({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handle() {
    if (
      !confirm(
        `Supprimer le compte de ${fullName} ?\n\nL'email sera anonymisé, les sessions supprimées. Les prêts et incidents historiques restent accessibles.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("userId", userId);
    start(async () => {
      const res = await deleteUser(emptyState, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Compte de ${fullName} supprimé.`);
        router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handle}
      disabled={pending}
      className="text-brick hover:bg-brick-soft hover:text-brick-ink"
    >
      <Trash2 className="size-4" />
      {pending ? "…" : "Supprimer"}
    </Button>
  );
}

export function ChangePasswordDialog({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("password", password);
    start(async () => {
      const res = await changeUserPassword(emptyState, fd);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success(`Mot de passe de ${fullName} modifié.`);
        setOpen(false);
        setPassword("");
        setConfirm("");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPassword("");
          setConfirm("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <KeyRound className="size-4" />
          Mot de passe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Changer le mot de passe</DialogTitle>
          <DialogDescription>{fullName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmer</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error ? (
            <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Modification…" : "Modifier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
