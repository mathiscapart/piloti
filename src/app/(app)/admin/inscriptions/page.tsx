import { UserPlus } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import { listPendingUsers } from "@/modules/admin/queries";

import { ApproveDialog } from "./approve-dialog";
import { RejectDialog } from "./reject-dialog";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminInscriptionsPage() {
  // US-32 — ADMIN + SECRÉTAIRE valident les inscriptions.
  const currentUser = await requireCan("user.approve");
  const canAssignPrivileged = can(currentUser, "admin.access");
  const users = await listPendingUsers();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          Administration
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Inscriptions en attente
        </h1>
        <p className="text-trail">
          {users.length === 0
            ? "Aucune demande en attente."
            : `${users.length} demande${users.length > 1 ? "s" : ""}`}
        </p>
      </header>

      {users.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Tout est à jour"
          description="Aucune inscription en attente de validation."
        />
      ) : (
        <ul className="space-y-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 rounded-2xl bg-snow p-5 shadow-card md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-earth">
                  {u.firstName} {u.lastName}
                </p>
                <p className="text-sm text-trail">{u.email}</p>
                <p className="mt-1 text-xs text-trail">
                  Demande le {DATE_FMT.format(u.createdAt)}
                  {u.unit ? ` · unité ${u.unit}` : ""}
                  {u.phone ? ` · ${u.phone}` : ""}
                </p>
              </div>
              <div className="flex gap-2 md:flex-shrink-0">
                <RejectDialog
                  userId={u.id}
                  fullName={`${u.firstName} ${u.lastName}`}
                />
                <ApproveDialog
                  userId={u.id}
                  fullName={`${u.firstName} ${u.lastName}`}
                  allowPrivileged={canAssignPrivileged}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
