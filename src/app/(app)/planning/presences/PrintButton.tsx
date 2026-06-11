"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// Export PDF via l'impression du navigateur (Imprimer → Enregistrer en PDF).
// Les éléments d'interface non pertinents portent `print:hidden`.
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="size-4" />
      Exporter en PDF
    </Button>
  );
}
