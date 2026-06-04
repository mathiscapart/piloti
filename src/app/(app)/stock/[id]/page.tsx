import {
  AlertTriangle,
  ArrowLeft,
  History,
  Pencil,
  Plus,
  Scale,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryChip, CategoryIcon } from "@/components/equipment/CategoryChip";
import { ConditionBadge } from "@/components/equipment/ConditionBadge";
import { IncidentBadge } from "@/components/equipment/IncidentBadge";
import { NfcSection } from "@/components/equipment/NfcSection";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { requireCan } from "@/lib/require-can";
import { getEquipmentDetail, listCategories } from "@/modules/inventory/queries";
import { CONDITION_LABEL } from "@/modules/inventory/types";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EquipmentDetailPage({ params }: PageProps) {
  await requireCan("equipment.view");
  const { id } = await params;
  const [eq, categories] = await Promise.all([
    getEquipmentDetail(id),
    listCategories(),
  ]);
  const categoryLabel = categories.find((c) => c.slug === eq?.category)?.label;
  if (!eq) notFound();

  // US-17/US-18 — la catégorie impose-t-elle une pesée au retour ?
  const isWeighable =
    categories.find((c) => c.slug === eq.category)?.requireWeighing ?? false;

  // US-18 — historique des pesées : chaque retour avec un poids relevé.
  // On calcule la consommation de chaque pesée par rapport à la précédente
  // (poids de base pour la toute première). Le poids de référence courant =
  // dernière pesée connue, sinon poids de base.
  const weighingsAsc = eq.loans
    .filter((l) => l.returnWeightKg != null && l.returnedAt != null)
    .sort((a, b) => a.returnedAt!.getTime() - b.returnedAt!.getTime());
  const weighings = weighingsAsc
    .map((l, i) => {
      // Poids de référence de cette pesée = pesée précédente, ou poids de base
      // pour la toute première.
      const previousWeight =
        i === 0 ? (eq.baseWeightKg ?? null) : weighingsAsc[i - 1].returnWeightKg;
      const consumed =
        previousWeight != null && l.returnWeightKg != null
          ? Math.round((previousWeight - l.returnWeightKg) * 100) / 100
          : null;
      return { loan: l, consumed };
    })
    .reverse(); // plus récente en premier pour l'affichage
  const referenceWeight =
    weighings[0]?.loan.returnWeightKg ?? eq.baseWeightKg ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-[calc(9rem_+_env(safe-area-inset-bottom))] pt-6 md:px-8 md:pt-10 md:pb-10">
      <Link
        href="/stock"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour au stock
      </Link>

      {/* Header : photo + titre + badges */}
      <section className="overflow-hidden rounded-2xl bg-snow shadow-card">
        <div className="flex aspect-video items-center justify-center bg-sand">
          {eq.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={eq.photo} alt={eq.name} className="size-full object-cover" />
          ) : (
            <CategoryIcon category={eq.category} className="size-16 text-trail/60" />
          )}
        </div>

        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip category={eq.category} label={categoryLabel} />
            <ConditionBadge condition={eq.condition} />
            <IncidentBadge count={eq.openIncidentCount} />
            {eq.archived ? (
              <span className="inline-flex items-center rounded-full bg-stone px-2.5 py-0.5 text-xs font-bold text-earth">
                Archivé
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-black text-earth md:text-3xl">{eq.name}</h1>
          <p className="text-xs text-trail">
            ID <code className="font-mono text-earth">{eq.id.slice(-8)}</code>
            {" · "}créé le {DATE_FMT.format(eq.createdAt)}
            {eq.location ? ` · ${eq.location}` : ""}
          </p>
          {eq.notes ? (
            <p className="rounded-xl bg-sand p-3 text-sm text-earth">{eq.notes}</p>
          ) : null}
        </div>
      </section>

      {/* Stats grid 2x2 */}
      <section className="grid grid-cols-2 gap-3 md:gap-4">
        <StatCell label="Total" value={eq.stats.totalQty} />
        <StatCell label="Disponible" value={eq.stats.availableQty} tone="forest" />
        <StatCell label="En prêt" value={eq.stats.loanedQty} tone="sky" />
        <StatCell label="En réparation" value={eq.stats.inRepairQty} tone="fire" />
      </section>

      {/* US-18 — suivi du poids (catégorie pesable uniquement) */}
      {isWeighable ? (
        <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Scale className="size-5 text-trail" />
            <h2 className="font-bold text-earth">Suivi du poids</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-sand p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-trail">
                Poids de base
              </p>
              <p className="mt-1 text-2xl font-black text-earth">
                {eq.baseWeightKg != null ? `${eq.baseWeightKg} kg` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-sand p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-trail">
                Dernière pesée
              </p>
              <p className="mt-1 text-2xl font-black text-earth">
                {referenceWeight != null ? `${referenceWeight} kg` : "—"}
              </p>
              <p className="text-xs text-trail">référence au prochain retour</p>
            </div>
          </div>

          {weighings.length === 0 ? (
            <p className="rounded-xl bg-sand p-3 text-sm text-trail">
              Aucune pesée enregistrée pour l&apos;instant. Le poids sera relevé
              à chaque retour de prêt.
            </p>
          ) : (
            <ul className="space-y-2">
              {weighings.map(({ loan, consumed }) => (
                <li
                  key={loan.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-earth">
                      {loan.returnWeightKg} kg
                      {consumed != null && consumed > 0 ? (
                        <span className="ml-2 text-xs font-medium text-trail">
                          (−{consumed} kg consommés)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-trail">
                      {loan.borrower.firstName} {loan.borrower.lastName}
                      {loan.eventName ? ` · ${loan.eventName}` : ""}
                    </p>
                  </div>
                  <time className="text-xs text-trail">
                    {loan.returnedAt ? DATE_FMT.format(loan.returnedAt) : ""}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* US-15 — identification NFC */}
      <NfcSection
        equipmentId={eq.id}
        nfcUid={eq.nfcUid}
        resolverBaseUrl={process.env.BETTER_AUTH_URL ?? ""}
      />

      {/* Tabs */}
      <section>
        <Tabs defaultValue="historique" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="historique">Historique</TabsTrigger>
            <TabsTrigger value="prets">Prêts</TabsTrigger>
            <TabsTrigger value="etats">États</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
          </TabsList>

          <TabsContent value="historique">
            {eq.auditLogs.length === 0 ? (
              <EmptyState
                icon={History}
                title="Aucune entrée"
                description="Les actions futures sur cet article apparaîtront ici."
              />
            ) : (
              <ul className="space-y-2">
                {eq.auditLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between rounded-xl bg-snow p-3 shadow-card"
                  >
                    <div>
                      <p className="text-sm font-bold text-earth">{log.action}</p>
                      <p className="text-xs text-trail">
                        {log.user.firstName} {log.user.lastName}
                      </p>
                    </div>
                    <time className="text-xs text-trail">
                      {DATETIME_FMT.format(log.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="prets">
            {eq.loans.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Aucun prêt"
                description="Cet article n'a pas encore été prêté."
              />
            ) : (
              <ul className="space-y-2">
                {eq.loans.map((loan) => (
                  <li
                    key={loan.id}
                    className="rounded-xl bg-snow p-3 shadow-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-earth">
                          {loan.borrower.firstName} {loan.borrower.lastName}
                          {loan.eventName ? ` · ${loan.eventName}` : ""}
                        </p>
                        <p className="text-xs text-trail">
                          {DATE_FMT.format(loan.startDate)} →{" "}
                          {DATE_FMT.format(loan.expectedReturn)}
                          {loan.returnedAt
                            ? ` · rendu le ${DATE_FMT.format(loan.returnedAt)}`
                            : ""}
                        </p>
                      </div>
                      <LoanStatusBadge status={loan.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="etats">
            <div className="space-y-3 rounded-xl bg-snow p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-earth">État actuel</p>
                <ConditionBadge condition={eq.condition} />
              </div>
              <p className="text-xs text-trail">
                {CONDITION_LABEL[eq.condition as keyof typeof CONDITION_LABEL] ?? eq.condition} ·
                dernière mise à jour le {DATE_FMT.format(eq.updatedAt)}
              </p>
              <p className="text-xs text-trail">
                L&apos;historique des changements d&apos;état détaillé arrive en
                Phase 6 (workflow de retour).
              </p>
            </div>
          </TabsContent>

          <TabsContent value="incidents">
            {eq.incidents.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Aucun incident"
                description="Aucun problème signalé sur cet article."
              />
            ) : (
              <ul className="space-y-2">
                {eq.incidents.map((inc) => (
                  <li
                    key={inc.id}
                    className="rounded-xl bg-snow p-3 shadow-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-earth">
                          {inc.severity}
                          {inc.resolvedAt ? " · résolu" : ""}
                        </p>
                        {inc.notes ? (
                          <p className="line-clamp-2 text-xs text-trail">
                            {inc.notes}
                          </p>
                        ) : null}
                        <p className="text-xs text-trail">
                          Par {inc.reporter.firstName} {inc.reporter.lastName} ·{" "}
                          {DATETIME_FMT.format(inc.createdAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {/* Bottom bar fixed actions — sur mobile, positionnée au-dessus de la
          BottomNav (h=4rem) + le safe-area iPhone. Les underscores autour du
          + sont volontaires : Tailwind v4 les remplace par des espaces pour
          que calc() reste un CSS valide (sans espaces, le browser ignore). */}
      <div className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-20 border-t border-stone/60 bg-snow p-3 md:bottom-0 md:left-64">
        <div className="mx-auto flex max-w-4xl gap-2">
          <Button asChild className="flex-1">
            <Link href={`/prets/nouveau?equipmentId=${eq.id}`}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Enregistrer un </span>prêt
            </Link>
          </Button>
          <Button asChild variant="destructive" className="flex-1">
            <Link href={`/incidents/nouveau?equipmentId=${eq.id}`}>
              <AlertTriangle className="size-4" />
              <span className="hidden sm:inline">Signaler </span>incident
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/stock/${eq.id}/modifier`}>
              <Pencil className="size-4" />
              Modifier
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "forest" | "sky" | "fire";
}) {
  const valueClass =
    tone === "forest"
      ? "text-forest"
      : tone === "sky"
        ? "text-sky"
        : tone === "fire"
          ? "text-fire"
          : "text-earth";
  return (
    <div className="rounded-2xl bg-snow p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wider text-trail">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function LoanStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    ACTIF: { label: "En cours", cls: "bg-forest-soft text-forest-ink" },
    RETARD: { label: "En retard", cls: "bg-brick-soft text-brick-ink" },
    RETOURNE: { label: "Rendu", cls: "bg-stone text-earth" },
    SECHAGE: { label: "En séchage", cls: "bg-sky-soft text-sky-ink" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-stone text-earth" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
