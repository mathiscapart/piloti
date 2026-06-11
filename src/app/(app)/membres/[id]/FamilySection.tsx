"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UNIT_LABEL, type Unit } from "@/lib/enums";
import { linkFamily, unlinkFamily } from "@/modules/family/actions";

interface FamilyUser {
  id: string;
  firstName: string;
  lastName: string;
  image?: string | null;
  unit?: string | null;
}
interface LinkEntry {
  linkId: string;
  user: FamilyUser;
}
interface LinkableUser {
  id: string;
  firstName: string;
  lastName: string;
  unit: string | null;
}

export function FamilySection({
  memberId,
  isParent,
  isJeune,
  childLinks,
  parentLinks,
  linkableChildren,
  linkableParents,
  canManage,
}: {
  memberId: string;
  isParent: boolean;
  isJeune: boolean;
  childLinks: LinkEntry[];
  parentLinks: LinkEntry[];
  linkableChildren: LinkableUser[];
  linkableParents: LinkableUser[];
  canManage: boolean;
}) {
  if (!isParent && !isJeune) return null;

  return (
    <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Famille</h2>

      {isParent ? (
        <FamilyBlock
          title="Enfants rattachés"
          emptyLabel="Aucun enfant rattaché."
          entries={childLinks}
          options={linkableChildren}
          canManage={canManage}
          addLabel="Rattacher un enfant"
          onAdd={(otherId) => linkFamily(memberId, otherId)}
          onRemove={(otherId) => unlinkFamily(memberId, otherId)}
        />
      ) : null}

      {isJeune ? (
        <FamilyBlock
          title="Parents / responsables"
          emptyLabel="Aucun parent rattaché."
          entries={parentLinks}
          options={linkableParents}
          canManage={canManage}
          addLabel="Rattacher un parent"
          onAdd={(otherId) => linkFamily(otherId, memberId)}
          onRemove={(otherId) => unlinkFamily(otherId, memberId)}
        />
      ) : null}
    </section>
  );
}

function FamilyBlock({
  title,
  emptyLabel,
  entries,
  options,
  canManage,
  addLabel,
  onAdd,
  onRemove,
}: {
  title: string;
  emptyLabel: string;
  entries: LinkEntry[];
  options: LinkableUser[];
  canManage: boolean;
  addLabel: string;
  onAdd: (otherId: string) => Promise<{ error: string | null }>;
  onRemove: (otherId: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error: string | null }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else {
        toast.success(ok);
        setSelected("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-trail">{title}</h3>

      {entries.length === 0 ? (
        <p className="text-sm text-trail">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.linkId}
              className="flex items-center gap-3 rounded-xl bg-sand/60 p-2"
            >
              <UserAvatar
                image={e.user.image}
                firstName={e.user.firstName}
                lastName={e.user.lastName}
                className="size-9"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-earth">
                {e.user.firstName} {e.user.lastName}
                {e.user.unit ? (
                  <span className="text-trail">
                    {" · "}
                    {UNIT_LABEL[e.user.unit as Unit] ?? e.user.unit}
                  </span>
                ) : null}
              </span>
              {canManage ? (
                <button
                  type="button"
                  aria-label="Retirer le rattachement"
                  onClick={() => run(() => onRemove(e.user.id), "Rattachement retiré.")}
                  disabled={pending}
                  className="shrink-0 rounded-full p-1.5 text-trail transition-colors hover:bg-brick-soft hover:text-brick-ink disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && options.length > 0 ? (
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-earth"
          >
            <option value="">{addLabel}…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName}
                {o.unit ? ` (${UNIT_LABEL[o.unit as Unit] ?? o.unit})` : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={pending || !selected}
            onClick={() => run(() => onAdd(selected), "Rattachement ajouté.")}
          >
            <Plus className="size-4" />
            Ajouter
          </Button>
        </div>
      ) : null}
    </div>
  );
}
