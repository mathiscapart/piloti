import { listCategories } from "@/modules/inventory/queries";
import {
  deleteCategory,
  updateCategoryCanDry,
} from "@/modules/inventory/category-actions";

import { CategoryCreateForm } from "./category-create-form";
import { CategoryDeleteButton } from "./category-delete-button";
import { CategoryDryToggle } from "./category-dry-toggle";

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="text-3xl font-black text-earth">Catégories</h1>
        <p className="text-trail">
          Gérez les catégories de matériel. Les catégories utilisées par des
          articles ne peuvent pas être supprimées.
        </p>
      </header>

      {/* Liste */}
      <section className="space-y-3">
        {categories.length === 0 ? (
          <p className="text-sm text-trail">Aucune catégorie.</p>
        ) : (
          categories.map((cat) => (
            <div
              key={cat.slug}
              className="flex items-center justify-between gap-4 rounded-2xl bg-snow p-4 shadow-card"
            >
              <div className="min-w-0">
                <p className="font-bold text-earth">{cat.label}</p>
                <p className="text-xs text-trail">{cat.slug}</p>
              </div>
              <div className="flex items-center gap-3">
                <CategoryDryToggle
                  slug={cat.slug}
                  canDry={cat.canDry}
                  action={updateCategoryCanDry}
                />
                <CategoryDeleteButton
                  slug={cat.slug}
                  action={deleteCategory}
                />
              </div>
            </div>
          ))
        )}
      </section>

      {/* Formulaire ajout */}
      <section className="rounded-2xl bg-snow p-6 shadow-card">
        <h2 className="mb-4 font-black text-earth">Nouvelle catégorie</h2>
        <CategoryCreateForm />
      </section>
    </div>
  );
}
