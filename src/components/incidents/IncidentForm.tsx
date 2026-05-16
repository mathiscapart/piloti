"use client";

import { Send } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { PhotoUploader } from "@/components/incidents/PhotoUploader";
import { SeverityPills } from "@/components/incidents/SeverityPill";
import { IncidentTypeGrid } from "@/components/incidents/IncidentTypeGrid";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { IncidentSeverity } from "@/lib/enums";
import type { ActionResult } from "@/lib/types";
import { createIncident } from "@/modules/inventory/incident-actions";

const initialState: ActionResult = { error: null };

export interface EquipmentOption {
  id: string;
  name: string;
  category: string;
}

interface IncidentFormProps {
  equipment: EquipmentOption[];
  preselectedEquipmentId?: string;
  loanId?: string;
}

export function IncidentForm({
  equipment,
  preselectedEquipmentId,
  loanId,
}: IncidentFormProps) {
  const [state, formAction, pending] = useActionState(
    createIncident,
    initialState,
  );

  const [equipmentId, setEquipmentId] = useState<string>(
    preselectedEquipmentId ?? "",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>("BLOQUANT");
  const [types, setTypes] = useState<Set<string>>(new Set());

  const selectedEquipment = useMemo(
    () => equipment.find((e) => e.id === equipmentId),
    [equipment, equipmentId],
  );

  function toggleType(value: string) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleEquipmentChange(id: string) {
    setEquipmentId(id);
    // Reset types — la liste change selon la catégorie
    setTypes(new Set());
  }

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl bg-snow p-6 shadow-card"
    >
      {/* Hidden inputs portés dans le formData */}
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <input type="hidden" name="severity" value={severity} />
      {loanId ? <input type="hidden" name="loanId" value={loanId} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="equipment">Article concerné</Label>
        <Select value={equipmentId} onValueChange={handleEquipmentChange}>
          <SelectTrigger id="equipment">
            <SelectValue placeholder="Choisir un article…" />
          </SelectTrigger>
          <SelectContent>
            {equipment.map((eq) => (
              <SelectItem key={eq.id} value={eq.id}>
                {eq.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Type(s) de problème</Label>
        <IncidentTypeGrid
          category={selectedEquipment?.category}
          selected={types}
          onToggle={toggleType}
        />
      </div>

      <div className="space-y-2">
        <Label>Gravité</Label>
        <SeverityPills value={severity} onChange={setSeverity} />
      </div>

      <div className="space-y-2">
        <Label>Photos</Label>
        <PhotoUploader />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Description / contexte</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          placeholder="Que s'est-il passé ? Où ? Détails utiles pour la réparation…"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="destructive"
        size="lg"
        className="w-full"
        disabled={pending || !equipmentId || types.size === 0}
      >
        <Send className="size-4" />
        {pending ? "Envoi…" : "Envoyer le rapport"}
      </Button>
    </form>
  );
}
