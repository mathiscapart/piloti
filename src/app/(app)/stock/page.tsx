import { ChevronRight, Package, Plus, Search } from "lucide-react";
import Link from "next/link";

import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { listEquipment, listCategoryTree } from "@/modules/inventory/queries";

interface PageProps {
  searchParams: Promise<{ q?: string; cat?: string }>;
}

export default async function StockPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim();

  const [tree, items] = await Promise.all([
    listCategoryTree(),
    listEquipment({ search: q, category: params.cat || undefined }),
  ]);

  // US-24 — résout la catégorie active : racine sélectionnée, ou sous-catégorie
  // (auquel cas on remonte sa racine pour afficher la rangée de sous-catégories).
  const rawCat = params.cat;
  let activeRoot: (typeof tree)[number] | undefined;
  let activeChildSlug: string | undefined;
  if (rawCat) {
    activeRoot = tree.find((r) => r.slug === rawCat);
    if (activeRoot) {
      activeChildSlug = undefined;
    } else {
      activeRoot = tree.find((r) => r.children.some((c) => c.slug === rawCat));
      if (activeRoot) activeChildSlug = rawCat;
    }
  }
  const cat = activeChildSlug ?? activeRoot?.slug;
  const catLabel = activeChildSlug
    ? activeRoot?.children.find((c) => c.slug === activeChildSlug)?.label
    : activeRoot?.label;

  const buildHref = (catSlug: string | null) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (catSlug) sp.set("cat", catSlug);
    return sp.toString() ? `/stock?${sp.toString()}` : "/stock";
  };

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

      {/* Niveau 1 : catégories racines */}
      <nav
        aria-label="Filtres par catégorie"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        <CategoryChip href={buildHref(null)} active={!cat} label="Tous" />
        {tree.map((root) => (
          <CategoryChip
            key={root.slug}
            href={buildHref(root.slug)}
            active={activeRoot?.slug === root.slug}
            label={root.label}
            hasChildren={root.children.length > 0}
          />
        ))}
      </nav>

      {/* Niveau 2 : sous-catégories (fil d'Ariane) si la racine active en a */}
      {activeRoot && activeRoot.children.length > 0 ? (
        <nav
          aria-label={`Sous-catégories de ${activeRoot.label}`}
          className="flex items-center gap-2 overflow-x-auto pb-1"
        >
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-trail">
            {activeRoot.label}
            <ChevronRight className="size-4" />
          </span>
          <CategoryChip
            href={buildHref(activeRoot.slug)}
            active={!activeChildSlug}
            label="Tout"
          />
          {activeRoot.children.map((sub) => (
            <CategoryChip
              key={sub.slug}
              href={buildHref(sub.slug)}
              active={activeChildSlug === sub.slug}
              label={sub.label}
            />
          ))}
        </nav>
      ) : null}

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

function CategoryChip({
  href,
  active,
  label,
  hasChildren,
}: {
  href: string;
  active: boolean;
  label: string;
  hasChildren?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
        active
          ? "bg-forest text-snow"
          : "bg-snow text-earth shadow-card hover:bg-sand",
      )}
    >
      {label}
      {hasChildren ? <ChevronRight className="size-3.5 opacity-60" /> : null}
    </Link>
  );
}
