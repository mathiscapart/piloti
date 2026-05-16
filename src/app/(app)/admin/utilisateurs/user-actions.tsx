"use client";

import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeUserRole,
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
