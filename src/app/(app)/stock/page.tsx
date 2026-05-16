import { Package, Plus, Search } from "lucide-react";
import Link from "next/link";

import { CategoryChip } from "@/components/equipment/CategoryChip";
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { listEquipment, listCategories } from "@/modules/inventory/queries";

interface PageProps {
  searchParams: Promise<{ q?: string; cat?: string }>;
}

export default async function StockPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim();

  const [categories, items] = await Promise.all([
    listCategories(),
    listEquipment({ search: q, category: params.cat || undefined }),
  ]);

  const validSlugs = new Set(categories.map((c) => c.slug));
  const cat = params.cat && validSlugs.has(params.cat) ? params.cat : undefined;
  const catLabel = cat ? (categories.find((c) => c.slug === cat)?.label ?? cat) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="text-3xl font-black text-earth md:text-4xl">Stock</h1>
        <p className="text-trail">
          {items.length} article{items.length > 1 ? "s" : ""}
          {q ? ` correspondant à "${q}"` : ""}
          {catLabel ? ` · ${catLabel}` : ""}
        </p>
      </header>

      <form
        method="GET"
        className="relative max-w-xl"
        role="search"
        aria-label="Recherche d'article"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Chercher un article…"
          className="pl-9"
        />
        {cat ? <input type="hidden" name="cat" value={cat} /> : null}
      </form>

      <nav
        aria-label="Filtres par catégorie"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        <CategoryFilterLink active={!cat} label="Tous" q={q} cat={null} />
        {categories.map((c) => (
          <CategoryFilterLink
            key={c.slug}
            active={cat === c.slug}
            label={c.label}
            q={q}
            cat={c.slug}
          />
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q || cat ? "Aucun résultat" : "Catalogue vide"}
          description={
            q || cat
              ? "Essaie une autre recherche ou catégorie."
              : "Commence par ajouter un premier article."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <EquipmentCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <Link
        href="/stock/nouveau"
        aria-label="Ajouter un article"
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-20 flex size-14 items-center justify-center rounded-full bg-forest text-snow shadow-elevated transition-colors hover:bg-forest/90 md:bottom-8 md:right-8"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}

function CategoryFilterLink({
  active,
  label,
  q,
  cat,
}: {
  active: boolean;
  label: string;
  q: string | undefined;
  cat: string | null;
}) {
  const urlParams = new URLSearchParams();
  if (q) urlParams.set("q", q);
  if (cat) urlParams.set("cat", cat);
  const href = urlParams.toString() ? `/stock?${urlParams.toString()}` : "/stock";

  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
        active
          ? "bg-forest text-snow"
          : "bg-snow text-earth shadow-card hover:bg-sand",
      )}
    >
      {label}
    </Link>
  );
}
