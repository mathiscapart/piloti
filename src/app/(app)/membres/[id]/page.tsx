import { ArrowLeft, Mail, Package, Phone } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryIcon } from "@/components/equipment/CategoryChip";
import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getMemberDetail } from "@/modules/inventory/queries";

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

  // US-26 — accès à l'annuaire des compétences : RG (member.directory) ou admin.
  const canSeeDirectory = can(currentUser, "member.directory");
  const isAdmin = can(currentUser, "admin.access");
  const isParent = effectiveRoles(user).includes("PARENT");
  const hasProfile =
    !!user.profession || !!user.skills || !!user.availability || !!user.helpNotes;

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
        {canSeeDirectory ? (
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
        {user.unit ? <p className="text-sm text-trail">{user.unit}</p> : null}

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

      {/* US-26 — profil parent enrichi : édition (admin) ou lecture (RG). */}
      {isParent && isAdmin ? (
        <MemberProfileForm
          userId={user.id}
          profession={user.profession}
          skills={user.skills}
          availability={user.availability}
          helpNotes={user.helpNotes}
          skillsConsent={user.skillsConsent}
        />
      ) : isParent && canSeeDirectory && hasProfile ? (
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
