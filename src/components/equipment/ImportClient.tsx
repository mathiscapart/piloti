"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  IMPORT_TEMPLATE_CSV,
  parseAndValidate,
  type RowStatus,
} from "@/lib/import-equipment";
import { importEquipment } from "@/modules/inventory/actions";

const STATUS_META: Record<RowStatus, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-forest-soft text-forest-ink" },
  duplicate: { label: "Doublon", cls: "bg-sun-soft text-sun-ink" },
  error: { label: "Erreur", cls: "bg-brick-soft text-brick-ink" },
};

export function ImportClient({
  categories,
  existingNames,
}: {
  categories: { slug: string; label: string }[];
  existingNames: string[];
}) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();

  const result = useMemo(
    () =>
      csv.trim()
        ? parseAndValidate(csv, { categories, existingNames })
        : { rows: [], headerError: undefined },
    [csv, categories, existingNames],
  );

  const okCount = result.rows.filter((r) => r.status === "ok").length;

  function downloadTemplate() {
    const blob = new Blob([IMPORT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gabarit-inventaire-piloti.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsv);
  }

  function handleImport() {
    startTransition(async () => {
      const res = await importEquipment(csv);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const r = res.report!;
      toast.success(
        `${r.created} article(s) importé(s)` +
          (r.duplicates ? ` · ${r.duplicates} doublon(s) ignoré(s)` : "") +
          (r.errors ? ` · ${r.errors} erreur(s)` : ""),
      );
      setCsv("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="size-4" />
          Télécharger le gabarit CSV
        </Button>
        <Button asChild variant="outline" size="sm">
          <label className="cursor-pointer">
            <Upload className="size-4" />
            Charger un fichier .csv
            <input type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          </label>
        </Button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="csv" className="text-sm font-bold text-earth">
          Données CSV
        </label>
        <textarea
          id="csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder="Colle ici le contenu CSV (ou charge un fichier).&#10;Colonnes : nom, categorie, quantite, etat, localisation, notes"
          className="w-full rounded-xl border border-stone/40 bg-snow p-3 font-mono text-xs text-earth focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-forest"
        />
        <p className="text-xs text-trail">
          Export Excel : « Enregistrer sous » → CSV. Séparateur , ou ; accepté.
        </p>
      </div>

      {result.headerError ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          {result.headerError}
        </p>
      ) : null}

      {result.rows.length > 0 ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-stone/30">
            <table className="w-full text-left text-sm">
              <thead className="bg-sand text-xs uppercase tracking-wider text-trail">
                <tr>
                  <th className="px-3 py-2">Ligne</th>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Catégorie</th>
                  <th className="px-3 py-2">Qté</th>
                  <th className="px-3 py-2">État</th>
                  <th className="px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.line} className="border-t border-stone/20">
                      <td className="px-3 py-2 text-trail">{r.line}</td>
                      <td className="px-3 py-2 font-medium text-earth">
                        {r.name || <span className="text-brick">—</span>}
                        {r.message ? (
                          <span className="block text-xs text-trail">{r.message}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-trail">{r.category}</td>
                      <td className="px-3 py-2 text-trail">{r.quantity}</td>
                      <td className="px-3 py-2 text-trail">{r.condition}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-bold",
                            meta.cls,
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-trail">
              {okCount} prêt(s) à importer · {result.rows.length - okCount} ignoré(s)
            </p>
            <Button disabled={pending || okCount === 0} onClick={handleImport}>
              {pending ? "Import…" : `Importer ${okCount} article(s)`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
