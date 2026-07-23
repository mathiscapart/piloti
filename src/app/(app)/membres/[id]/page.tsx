import { ArrowLeft, Mail, Package, Phone } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryIcon } from "@/components/equipment/CategoryChip";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  getFamilyForMember,
  listLinkableChildren,
  listLinkableParents,
} from "@/modules/family/queries";
import { getMemberDetail } from "@/modules/inventory/queries";
import {
  CONSECUTIVE_ABSENCE_THRESHOLD,
  getMemberAttendanceStats,
} from "@/modules/planning/stats";

import { FamilySection } from "./FamilySection";
import { MemberProfileForm } from "./MemberProfileForm";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  CHEF: "Chef",
  PARENT: "Parent",
  JEUNE: "Jeune",
};

// Date d'événement : formatée en UTC (heure murale, cf. module planning).
const EVENT_DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  // US-14 — réservé aux chefs / admins.
  if (!can(currentUser, "member.view")) redirect("/dashboard");

  const member = await getMemberDetail(id);
  if (!member) notFound();

  const { user, loans } = member;
  const now = new Date();

  // US-26 — annuaire des compétences : RG (member.directory) ou admin peuvent
  // CONSULTER et ÉDITER le profil parent ; les autres rôles avec member.view le
  // voient en lecture seule.
  const canManageProfile = can(currentUser, "member.directory");
  const isParent = effectiveRoles(user).includes("PARENT");
  const isJeune = effectiveRoles(user).includes("SCOUT");
  const hasProfile =
    !!user.profession || !!user.skills || !!user.availability || !!user.helpNotes;

  // Rattachement familial : liens du membre + (pour user.manage) listes
  // d'ajout selon son rôle. Affiché pour parents et jeunes.
  const canManageFamily = can(currentUser, "user.manage");
  const family = await getFamilyForMember(user.id);
  const [linkableChildren, linkableParents] = await Promise.all([
    canManageFamily && isParent ? listLinkableChildren(user.id) : Promise.resolve([]),
    canManageFamily && isJeune ? listLinkableParents(user.id) : Promise.resolve([]),
  ]);

  // US-P08 — statistiques de présence (jeunes uniquement).
  const attendanceStats = isJeune
    ? await getMemberAttendanceStats(user.id)
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/prets"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux prêts
        </Link>
        {isJeune && can(currentUser, "pedago.view") ? (
          <Link
            href={`/membres/${user.id}/progression`}
            className="text-sm font-bold text-forest hover:underline"
          >
            Progression →
          </Link>
        ) : canManageProfile ? (
          <Link
            href="/membres/annuaire"
            className="text-sm font-bold text-forest hover:underline"
          >
            Annuaire des compétences →
          </Link>
        ) : null}
      </div>

      {/* Identité + contact */}
      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <div className="flex items-start gap-4">
          <UserAvatar
            image={user.image}
            firstName={user.firstName}
            lastName={user.lastName}
            className="size-16 shrink-0 text-xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-earth md:text-3xl">
                {user.firstName} {user.lastName}
              </h1>
              <span className="inline-flex items-center rounded-full bg-sand px-2.5 py-0.5 text-xs font-bold text-earth">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              {user.status === "SUSPENDED" ? (
                <span className="inline-flex items-center rounded-full bg-brick-soft px-2.5 py-0.5 text-xs font-bold text-brick-ink">
                  Suspendu
                </span>
              ) : null}
            </div>
            {user.unit ? (
              <p className="text-sm text-trail">{user.unit}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {user.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${user.phone.replace(/\s/g, "")}`}>
                <Phone className="size-4" />
                {user.phone}
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${user.email}`}>
              <Mail className="size-4" />
              {user.email}
            </a>
          </Button>
        </div>
      </section>

      {/* US-26 — profil parent enrichi : édition (RG/admin) ou lecture seule. */}
      {isParent && canManageProfile ? (
        <MemberProfileForm
          userId={user.id}
          profession={user.profession}
          skills={user.skills}
          availability={user.availability}
          helpNotes={user.helpNotes}
          skillsConsent={user.skillsConsent}
        />
      ) : isParent && hasProfile ? (
        <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Profil &amp; compétences</h2>
          {!user.skillsConsent ? (
            <p className="rounded-md bg-sun-soft px-3 py-2 text-xs font-medium text-sun-ink">
              Consentement RGPD non donné — infos non publiées dans l&apos;annuaire.
            </p>
          ) : null}
          {user.profession ? (
            <p className="text-sm text-earth">
              <span className="font-bold">Profession :</span> {user.profession}
            </p>
          ) : null}
          {user.skills ? (
            <p className="text-sm text-earth">
              <span className="font-bold">Compétences :</span> {user.skills}
            </p>
          ) : null}
          {user.availability ? (
            <p className="text-sm text-earth">
              <span className="font-bold">Disponibilités :</span>{" "}
              {user.availability}
            </p>
          ) : null}
          {user.helpNotes ? (
            <p className="text-sm text-trail">{user.helpNotes}</p>
          ) : null}
        </section>
      ) : null}

      {/* Rattachement familial (parent ↔ jeune) */}
      <FamilySection
        memberId={user.id}
        isParent={isParent}
        isJeune={isJeune}
        childLinks={family.children}
        parentLinks={family.parents}
        linkableChildren={linkableChildren}
        linkableParents={linkableParents}
        canManage={canManageFamily}
      />

      {/* QF masqué — décision groupe (pas d'exposition/collecte du quotient
          familial en UI pour l'instant), cf. DECISIONS.md. `BracketSelect`,
          `listBrackets` et `user.socialBracketId` sont conservés côté code. */}

      {/* US-P08 — statistiques de présence (jeunes). */}
      {attendanceStats ? (
        <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-earth">Présence</h2>
            {attendanceStats.rate !== null ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-sm font-bold",
                  attendanceStats.rate >= 70
                    ? "bg-forest-soft text-forest-ink"
                    : attendanceStats.rate >= 40
                      ? "bg-sun-soft text-sun-ink"
                      : "bg-brick-soft text-brick-ink",
                )}
              >
                {attendanceStats.rate}%
              </span>
            ) : null}
          </div>

          {attendanceStats.total === 0 ? (
            <p className="text-sm text-trail">
              Aucun pointage enregistré pour le moment.
            </p>
          ) : (
            <>
              {attendanceStats.atRisk ? (
                <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
                  ⚠️ {attendanceStats.consecutiveAbsences} absences consécutives
                  (seuil d&apos;alerte : {CONSECUTIVE_ABSENCE_THRESHOLD}).
                </p>
              ) : null}
              <p className="text-sm text-earth">
                Présent à{" "}
                <span className="font-bold">
                  {attendanceStats.present}/{attendanceStats.total}
                </span>{" "}
                événements pointés.
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {attendanceStats.recent.map((t) => (
                  <li
                    key={t.event.id}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      t.present
                        ? "bg-forest-soft text-forest-ink"
                        : "bg-brick-soft text-brick-ink",
                    )}
                    title={t.event.name}
                  >
                    {EVENT_DAY_FMT.format(t.event.startDate)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

      {/* Matériel détenu */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-earth">
          Matériel détenu ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Aucun matériel en cours"
            description="Ce membre n'a aucun prêt actif."
          />
        ) : (
          <ul className="space-y-2">
            {loans.map((loan) => {
              const late =
                loan.status === "RETARD" ||
                (loan.status === "ACTIF" && loan.expectedReturn < now);
              return (
                <li
                  key={loan.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl bg-snow p-3 shadow-card",
                    late && "border-l-4 border-brick",
                  )}
                >
                  <div className="flex aspect-square size-11 shrink-0 items-center justify-center rounded-xl bg-sand">
                    <CategoryIcon
                      category={loan.equipment.category}
                      className="size-5 text-trail"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/stock/${loan.equipment.id}`}
                        className="font-bold text-earth hover:text-forest"
                      >
                        {loan.equipment.name}
                      </Link>
                      {loan.quantity > 1 ? (
                        <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-earth">
                          ×{loan.quantity}
                        </span>
                      ) : null}
                      <LoanStatusBadge status={loan.status} />
                    </div>
                    <p
                      className={cn(
                        "text-xs",
                        late ? "font-bold text-brick" : "text-trail",
                      )}
                    >
                      Retour {late ? "était" : "prévu"} le{" "}
                      {DATE_FMT.format(loan.expectedReturn)}
                      {loan.eventName ? ` · ${loan.eventName}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
