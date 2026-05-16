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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeUserPassword,
  changeUserRole,
  deleteUser,
  reactivateUser,
  suspendUser,
} from "@/modules/admin/actions";

const emptyState = { error: null } as const;

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();

  function handleChange(newRole: string) {
    if (newRole === value || pending) return;
    const previous = value;
    setValue(newRole);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", newRole);
    startTransition(async () => {
      const res = await changeUserRole(emptyState, fd);
      if (res.error) {
        setValue(previous);
        toast.error(res.error);
      } else {
        toast.success("Rôle mis à jour.");
        router.refresh();
      }
    });
  }

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={disabled || pending}
    >
      <SelectTrigger className="h-9 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="CHEF">Chef</SelectItem>
        <SelectItem value="ADMIN">Administrateur</SelectItem>
      </SelectContent>
    </Select>
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
