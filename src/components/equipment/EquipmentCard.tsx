import Link from "next/link";

import { CategoryIcon } from "@/components/equipment/CategoryChip";
import { ConditionBadge } from "@/components/equipment/ConditionBadge";
import { IncidentBadge } from "@/components/equipment/IncidentBadge";
import type { EquipmentListItem } from "@/modules/inventory/queries";

export function EquipmentCard({ item }: { item: EquipmentListItem }) {
  return (
    <Link
      href={`/stock/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-snow shadow-card transition-shadow hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex aspect-video items-center justify-center bg-sand">
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo}
            alt={item.name}
            className="size-full object-cover"
          />
        ) : (
          <CategoryIcon
            category={item.category}
            className="size-12 text-trail/60"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-bold text-earth group-hover:text-forest">
          {item.name}
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <ConditionBadge condition={item.condition} />
          <IncidentBadge count={item.openIncidentCount} />
        </div>

        <p className="mt-auto text-xs text-trail">
          <span className="font-bold text-earth">
            {item.availableQty}
          </span>{" "}
          / {item.totalQty} disponible{item.totalQty > 1 ? "s" : ""}
          {item.location ? ` · ${item.location}` : ""}
        </p>
      </div>
    </Link>
  );
}
