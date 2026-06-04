import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Droplets,
  History,
  type LucideIcon,
  Package,
  Pencil,
  Truck,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { requireCan } from "@/lib/require-can";
import { cn } from "@/lib/utils";
import {
  listAuditActions,
  listAuditLog,
  listAuditUsers,
} from "@/modules/admin/queries";

const DATETIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const ACTION_LABEL: Record<string, string> = {
  USER_REGISTERED: "Inscription",
  USER_APPROVED: "Compte validé",
  USER_REJECTED: "Compte refusé",
  USER_SUSPENDED: "Compte suspendu",
  USER_ROLE_CHANGED: "Rôle modifié",
  USER_UNIT_CHANGED: "Unité modifiée",
  EQUIPMENT_CREATED: "Article créé",
  EQUIPMENT_UPDATED: "Article modifié",
  EQUIPMENT_ARCHIVED: "Article archivé",
  EQUIPMENT_STATUS_CHANGED: "État article changé",
  LOAN_CREATED: "Prêt créé",
  LOAN_RETURNED: "Prêt retourné",
  LOAN_DRYING_STARTED: "Mis en séchage",
  INCIDENT_REPORTED: "Incident signalé",
  INCIDENT_RESOLVED: "Incident résolu",
};

const ACTION_ICON: Record<string, LucideIcon> = {
  USER_REGISTERED: UserPlus,
  USER_APPROVED: UserCheck,
  USER_REJECTED: UserX,
  USER_SUSPENDED: UserMinus,
  USER_ROLE_CHANGED: UserCheck,
  EQUIPMENT_CREATED: Package,
  EQUIPMENT_UPDATED: Pencil,
  EQUIPMENT_ARCHIVED: Archive,
  EQUIPMENT_STATUS_CHANGED: Pencil,
  LOAN_CREATED: Truck,
  LOAN_RETURNED: Truck,
  LOAN_DRYING_STARTED: Droplets,
  INCIDENT_REPORTED: AlertTriangle,
  INCIDENT_RESOLVED: CheckCircle2,
};

const ACTION_TONE: Record<string, string> = {
  USER_REGISTERED: "bg-sky-soft text-sky-ink",
  USER_APPROVED: "bg-forest-soft text-forest-ink",
  USER_REJECTED: "bg-brick-soft text-brick-ink",
  USER_SUSPENDED: "bg-fire-soft text-fire-ink",
  USER_ROLE_CHANGED: "bg-sky-soft text-sky-ink",
  USER_UNIT_CHANGED: "bg-sky-soft text-sky-ink",
  EQUIPMENT_CREATED: "bg-forest-soft text-forest-ink",
  EQUIPMENT_UPDATED: "bg-sand text-earth",
  EQUIPMENT_ARCHIVED: "bg-stone text-earth",
  EQUIPMENT_STATUS_CHANGED: "bg-fire-soft text-fire-ink",
  LOAN_CREATED: "bg-sky-soft text-sky-ink",
  LOAN_RETURNED: "bg-forest-soft text-forest-ink",
  LOAN_DRYING_STARTED: "bg-sky-soft text-sky-ink",
  INCIDENT_REPORTED: "bg-brick-soft text-brick-ink",
  INCIDENT_RESOLVED: "bg-forest-soft text-forest-ink",
};

interface PageProps {
  searchParams: Promise<{
    action?: string;
    userId?: string;
    page?: string;
  }>;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  // US-32 — journal d'audit en lecture : ADMIN + RG (lecture seule).
  await requireCan("audit.view");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [{ items, total, pageCount }, actions, users] = await Promise.all([
    listAuditLog({
      action: params.action,
      userId: params.userId,
      page,
    }),
    listAuditActions(),
    listAuditUsers(),
  ]);

  const buildHref = (
    overrides: Partial<{ action: string; userId: string; page: string }>,
  ) => {
    const p = new URLSearchParams();
    const a = overrides.action ?? params.action;
    const u = overrides.userId ?? params.userId;
    const pg = overrides.page ?? params.page;
    if (a) p.set("action", a);
    if (u) p.set("userId", u);
    if (pg && pg !== "1") p.set("page", pg);
    return p.toString() ? `/admin/audit?${p.toString()}` : "/admin/audit";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          Administration
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Journal d&apos;audit
        </h1>
        <p className="text-trail">
          {total} entrée{total > 1 ? "s" : ""} · toutes les modifications de
          données sont tracées
        </p>
      </header>

      {/* Filtres */}
      <form
        method="GET"
        className="grid gap-3 rounded-2xl bg-snow p-4 shadow-card md:grid-cols-[1fr_1fr_auto]"
      >
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Action
          </span>
          <select
            name="action"
            defaultValue={params.action ?? ""}
            className="h-10 w-full rounded-md border border-input bg-snow px-3 text-sm"
          >
            <option value="">Toutes</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a] ?? a}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Utilisateur
          </span>
          <select
            name="userId"
            defaultValue={params.userId ?? ""}
            className="h-10 w-full rounded-md border border-input bg-snow px-3 text-sm"
          >
            <option value="">Tous</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1">
            Filtrer
          </Button>
          {params.action || params.userId ? (
            <Button asChild variant="outline">
              <Link href="/admin/audit">Reset</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {/* Timeline */}
      {items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucune entrée"
          description="Aucune action ne correspond à ce filtre."
        />
      ) : (
        <ol className="relative space-y-3 border-l-2 border-stone/60 pl-6">
          {items.map((it) => {
            const Icon = ACTION_ICON[it.action] ?? Clock;
            const tone = ACTION_TONE[it.action] ?? "bg-stone text-earth";
            const label = ACTION_LABEL[it.action] ?? it.action;
            return (
              <li key={it.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[34px] flex size-7 items-center justify-center rounded-full border-2 border-snow",
                    tone,
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="rounded-2xl bg-snow p-4 shadow-card">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-earth">{label}</p>
                    <time className="text-xs text-trail">
                      {DATETIME_FMT.format(it.createdAt)}
                    </time>
                  </div>
                  <p className="text-sm text-trail">
                    par {it.user.firstName} {it.user.lastName}
                    {it.equipment ? (
                      <>
                        {" · "}
                        <Link
                          href={`/stock/${it.equipment.id}`}
                          className="font-bold text-earth hover:text-forest"
                        >
                          {it.equipment.name}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  {it.metadata && it.metadata !== "{}" ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-trail">
                        Détails
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-sand p-2 font-mono text-[11px] text-earth">
                        {prettyJson(it.metadata)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Pagination */}
      {pageCount > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Pages">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref({ page: String(page - 1) })}>← Précédent</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-trail">
            Page {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref({ page: String(page + 1) })}>Suivant →</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
