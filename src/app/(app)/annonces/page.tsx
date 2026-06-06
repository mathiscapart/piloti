import { Megaphone, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { ANNOUNCEMENT_AUDIENCE_LABEL } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listAnnouncementsForUser } from "@/modules/communication/announcement-queries";

import { DeleteAnnouncementButton } from "./AnnouncementActions";

export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();
  const [announcements, canPublish] = [
    await listAnnouncementsForUser(user),
    can(user, "announcement.publish"),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-earth">
            <Megaphone className="size-7 text-forest" />
            Annonces
          </h1>
          <p className="text-trail">Les annonces du groupe.</p>
        </div>
        {canPublish ? (
          <Link
            href="/annonces/nouvelle"
            className="inline-flex items-center gap-1.5 rounded-full bg-forest px-4 py-2 text-sm font-bold text-snow transition-colors hover:bg-forest-ink"
          >
            <Plus className="size-4" />
            Publier
          </Link>
        ) : null}
      </header>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Aucune annonce"
          description={
            canPublish
              ? "Publie la première annonce du groupe."
              : "Aucune annonce pour le moment."
          }
        />
      ) : (
        <ul className="space-y-4">
          {announcements.map((a) => (
            <li
              key={a.id}
              className={cn(
                "space-y-2 rounded-2xl bg-snow p-5 shadow-card",
                a.urgent && "ring-2 ring-brick",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {a.urgent ? (
                    <span className="rounded-full bg-brick px-2 py-0.5 text-xs font-black text-snow">
                      🚨 URGENT
                    </span>
                  ) : null}
                  <h2 className="text-lg font-black text-earth">{a.title}</h2>
                </div>
                {a.canManage ? <DeleteAnnouncementButton id={a.id} /> : null}
              </div>

              <p className="whitespace-pre-wrap text-sm text-earth">{a.body}</p>

              {a.attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {a.attachments.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="size-20 rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : null}

              <p className="pt-1 text-xs text-trail">
                {a.authorName} · {DATE_FMT.format(a.createdAt)} ·{" "}
                {ANNOUNCEMENT_AUDIENCE_LABEL[a.audience] ?? a.audience}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
