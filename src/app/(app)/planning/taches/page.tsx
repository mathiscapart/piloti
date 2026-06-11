import { ArrowLeft, ListTodo } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listBorrowers } from "@/modules/inventory/queries";
import { listTasks, type TaskStatusFilter } from "@/modules/planning/tasks";

import { CreateTaskForm } from "./CreateTaskForm";
import { TaskList, type TaskVM } from "./TaskList";

const DUE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const STATUS_TABS: { value: TaskStatusFilter; label: string }[] = [
  { value: "open", label: "À faire" },
  { value: "done", label: "Faites" },
  { value: "all", label: "Toutes" },
];

interface PageProps {
  searchParams: Promise<{ status?: string; assignee?: string }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "task.view")) redirect("/dashboard");
  const canManage = can(user, "task.manage");

  const { status, assignee } = await searchParams;
  const statusFilter: TaskStatusFilter =
    status === "done" || status === "all" ? status : "open";
  const assigneeFilter = assignee ?? "";

  const [tasks, assignees] = await Promise.all([
    listTasks({
      status: statusFilter,
      assigneeId: assigneeFilter || undefined,
    }),
    listBorrowers(),
  ]);

  // Aujourd'hui à minuit UTC (les échéances sont stockées en date « murale »).
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  const vm: TaskVM[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    assigneeFirst: t.assignee?.firstName ?? null,
    assigneeLast: t.assignee?.lastName ?? null,
    assigneeImage: t.assignee?.image ?? null,
    dueLabel: t.dueDate ? DUE_FMT.format(t.dueDate) : null,
    overdue: !t.done && t.dueDate ? t.dueDate.getTime() < todayUtc : false,
    canToggle: canManage || t.assignee?.id === user.id,
    canDelete: canManage,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/planning"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour au planning
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-black text-earth md:text-4xl">
          <ListTodo className="size-7 text-forest" />
          Tâches
        </h1>
      </header>

      {canManage ? <CreateTaskForm assignees={assignees} /> : null}

      {/* Filtres : statut + responsable (GET). */}
      <form method="GET" className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-sand p-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={{
                pathname: "/planning/taches",
                query: {
                  status: tab.value,
                  ...(assigneeFilter ? { assignee: assigneeFilter } : {}),
                },
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-bold transition-colors",
                statusFilter === tab.value
                  ? "bg-snow text-earth shadow-sm"
                  : "text-trail",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <input type="hidden" name="status" value={statusFilter} />
        <select
          name="assignee"
          defaultValue={assigneeFilter}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-earth sm:max-w-xs"
        >
          <option value="">Tous les responsables</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.firstName} {a.lastName}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 shrink-0 rounded-full bg-forest px-4 text-sm font-bold text-snow hover:bg-forest/90"
        >
          Filtrer
        </button>
      </form>

      <TaskList tasks={vm} />
    </div>
  );
}
