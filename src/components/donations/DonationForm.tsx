"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EQUIPMENT_CONDITIONS } from "@/lib/enums";
import { createDonation } from "@/modules/inventory/donation-actions";
import type { CategoryRow } from "@/modules/inventory/queries";
import { CONDITION_LABEL } from "@/modules/inventory/types";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult = { error: null };

export function DonationForm({
  categories,
  defaultDonorName,
}: {
  categories: CategoryRow[];
  defaultDonorName: string;
}) {
  const [state, formAction, pending] = useActionState(createDonation, initialState);

  const roots = categories
    .filter((c) => !c.parentSlug)
    .sort((a, b) => (a.slug === "AUTRE" ? 1 : 0) - (b.slug === "AUTRE" ? 1 : 0));
  const childrenOf = (slug: string) =>
    categories.filter((c) => c.parentSlug === slug);

  return (
    <form action={formAction} className="space-y-5 rounded-2xl bg-snow p-6 shadow-card">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nom de l&apos;article</Label>
        <Input id="name" name="name" required placeholder="Tente, malle, réchaud…" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Catégorie</Label>
          <Select name="category" defaultValue={roots[0]?.slug ?? ""}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {roots.map((root) => {
                const subs = childrenOf(root.slug);
                if (subs.length === 0) {
                  return (
                    <SelectItem key={root.slug} value={root.slug}>
                      {root.label}
                    </SelectItem>
                  );
                }
                return (
                  <SelectGroup key={root.slug}>
                    <SelectLabel>{root.label}</SelectLabel>
                    <SelectItem value={root.slug}>{root.label} — général</SelectItem>
                    {subs.map((sub) => (
                      <SelectItem key={sub.slug} value={sub.slug} className="pl-8">
                        {sub.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="condition">État</Label>
          <Select name="condition" defaultValue="BON">
            <SelectTrigger id="condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantité</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            required
            defaultValue={1}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dropoffDate">Date de dépôt prévue (optionnel)</Label>
          <Input id="dropoffDate" name="dropoffDate" type="date" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="donorName">Nom du donateur</Label>
        <Input
          id="donorName"
          name="donorName"
          defaultValue={defaultDonorName}
          placeholder="Votre nom"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optionnel)</Label>
        <Textarea id="note" name="note" rows={3} placeholder="Précisions sur le don…" />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Envoi…" : "Proposer le don"}
        </Button>
      </div>
    </form>
  );
}
