import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { listEvents } from "@/modules/planning/queries";

import { ExpenseForm } from "../ExpenseForm";

export default async function NewExpensePage() {
  const user = await getCurrentUser();
  if (!can(user, "expense.create")) redirect("/finances/notes");

  const events = await listEvents({ scope: "upcoming" });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/finances/notes"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour aux notes de frais
      </Link>
      <h1 className="text-3xl font-black text-earth md:text-4xl">
        Nouvelle note de frais
      </h1>
      <section className="rounded-2xl bg-snow p-5 shadow-card">
        <ExpenseForm events={events.map((e) => ({ id: e.id, name: e.name }))} />
      </section>
    </div>
  );
}
