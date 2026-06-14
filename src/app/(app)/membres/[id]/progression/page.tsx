import { ArrowLeft, FileText, GraduationCap } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { isChildOf } from "@/modules/family/queries";
import { listBadgesForUnit } from "@/modules/pedagogy/referential";
import { getProgression } from "@/modules/pedagogy/progression";

import { ProgressionView } from "./ProgressionView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProgressionPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  // Accès : encadrement (pedago.view) ; le jeune lui-même ; un parent du jeune.
  // Les notes sensibles (US-S07) ne sont visibles que de l'encadrement.
  const isStaff = can(user, "pedago.view");
  const isSelf = user.id === id;
  const isParent = !isStaff && !isSelf ? await isChildOf(user.id, id) : false;
  if (!isStaff && !isSelf && !isParent) redirect("/dashboard");

  const canManage = can(user, "pedago.manage");
  const includeNotes = isStaff;

  const data = await getProgression(id, includeNotes);
  if (!data) notFound();

  // Badges attribuables (catalogue filtré par la branche du jeune), pour les chefs.
  const awardable = canManage
    ? (await listBadgesForUnit(data.jeune.unit)).filter(
        (b) => !data.badges.some((aw) => aw.badgeId === b.id),
      )
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={isStaff ? `/membres/${id}` : "/dashboard"}
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href={`/membres/${id}/progression/bilan`}>
            <FileText className="size-4" />
            Bilan PDF
          </Link>
        </Button>
      </div>

      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <GraduationCap className="size-3.5" />
          Progression
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {data.jeune.firstName} {data.jeune.lastName}
        </h1>
      </header>

      <ProgressionView
        jeuneId={id}
        data={data}
        canManage={canManage}
        currentUserId={user.id}
        awardableBadges={awardable.map((b) => ({ id: b.id, name: b.name, icon: b.icon }))}
      />
    </div>
  );
}
