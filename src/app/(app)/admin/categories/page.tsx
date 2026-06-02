import { listCategoryTree, listCategories } from "@/modules/inventory/queries";

import { CategoryArchiveButton } from "./category-archive-button";
import { CategoryBehaviorToggle } from "./category-behavior-toggle";
import { CategoryCreateForm } from "./category-create-form";
import { CategoryParentSelect } from "./category-parent-select";

export default async function CategoriesPage() {
  const [tree, all] = await Promise.all([
    listCategoryTree({ includeArchived: true }),
    listCategories({ includeArchived: true }),
  ]);

  // Parents disponibles pour la création / le déplacement : racines actives uniquement.
  const roots = all.filter((c) => !c.parentSlug && !c.archived);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="text-3xl font-black text-earth">Catégories</h1>
        <p className="text-trail">
          Organisez le matériel en catégories et sous-catégories (2 niveaux).
          L&apos;archivage est possible quand la catégorie n&apos;a plus de
          sous-catégorie active ni d&apos;article actif.
        </p>
      </header>

      {/* Arborescence */}
      <section className="space-y-3">
        {tree.length === 0 ? (
          <p className="text-sm text-trail">Aucune catégorie.</p>
        ) : (
          tree.map((cat) => {
            const parentOptions = roots
              .filter((r) => r.slug !== cat.slug)
              .map((r) => ({ slug: r.slug, label: r.label }));
            const isAutre = cat.slug === "AUTRE";
            return (
              <div
                key={cat.slug}
                className="space-y-2 rounded-2xl bg-snow p-4 shadow-card"
              >
                {/* Catégorie racine */}
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold text-earth">
                      {cat.label}
                      {cat.archived ? (
                        <span className="rounded-full bg-stone/30 px-2 py-0.5 text-[10px] font-bold uppercase text-trail">
                          Archivée
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-trail">{cat.slug}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <CategoryBehaviorToggle
                      slug={cat.slug}
                      behavior="canDry"
                      active={cat.canDry}
                    />
                    <CategoryBehaviorToggle
                      slug={cat.slug}
                      behavior="requireWeighing"
                      active={cat.requireWeighing}
                    />
                    {/* Une racine avec sous-catégories ne peut pas être déplacée */}
                    {cat.children.length === 0 && !cat.archived ? (
                      <CategoryParentSelect
                        slug={cat.slug}
                        parentSlug={cat.parentSlug}
                        options={parentOptions}
                      />
                    ) : null}
                    {/* « Autre » : pas d'action d'archivage */}
                    {isAutre ? null : (
                      <CategoryArchiveButton slug={cat.slug} archived={cat.archived} />
                    )}
                  </div>
                </div>

                {/* Sous-catégories */}
                {cat.children.length > 0 ? (
                  <ul className="space-y-2 border-l-2 border-sand pl-4">
                    {cat.children.map((sub) => (
                      <li
                        key={sub.slug}
                        className="flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-semibold text-earth">
                            {sub.label}
                            {sub.archived ? (
                              <span className="rounded-full bg-stone/30 px-2 py-0.5 text-[10px] font-bold uppercase text-trail">
                                Archivée
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-trail">{sub.slug}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <CategoryBehaviorToggle
                            slug={sub.slug}
                            behavior="canDry"
                            active={sub.canDry}
                          />
                          <CategoryBehaviorToggle
                            slug={sub.slug}
                            behavior="requireWeighing"
                            active={sub.requireWeighing}
                          />
                          {!sub.archived ? (
                            <CategoryParentSelect
                              slug={sub.slug}
                              parentSlug={sub.parentSlug}
                              options={roots
                                .filter((r) => r.slug !== sub.slug)
                                .map((r) => ({ slug: r.slug, label: r.label }))}
                            />
                          ) : null}
                          <CategoryArchiveButton
                            slug={sub.slug}
                            archived={sub.archived}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {/* Formulaire ajout */}
      <section className="rounded-2xl bg-snow p-6 shadow-card">
        <h2 className="mb-4 font-black text-earth">Nouvelle catégorie</h2>
        <CategoryCreateForm roots={roots} />
      </section>
    </div>
  );
}
