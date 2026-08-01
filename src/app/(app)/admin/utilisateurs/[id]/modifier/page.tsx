import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { can, canAssignRole } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import {
  ChangePasswordDialog,
  DeleteUserButton,
  ReactivateButton,
  RolesEditor,
  SuspendButton,
  UnitEditor,
} from "../../user-actions";

import { UserAccountForm } from "./UserAccountForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

function parseRoles(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

// US-32/US-CM-01 — édition complète d'un compte (identité + email + unité).
// Même garde « cible protégée » que /admin/utilisateurs : la SECRÉTAIRE ne
// peut pas éditer un compte ADMIN/Responsable de groupe.
export default async function EditUserAccountPage({ params }: PageProps) {
  const { id } = await params;
  const currentUser = await requireCan("user.manage");

  const target = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      unit: true,
      roles: true,
      canLogin: true,
      status: true,
    },
  });
  if (!target) notFound();

  const roles = parseRoles(target.roles);
  const canManage =
    can(currentUser, "admin.access") || roles.every((r) => canAssignRole(currentUser, r));
  if (!canManage) notFound();

  const isAdmin = can(currentUser, "admin.access");
  const isSelf = target.id === currentUser.id;
  const suspended = target.status === "SUSPENDED";
  const fullName = `${target.firstName} ${target.lastName}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <Link
          href="/admin/utilisateurs"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux utilisateurs
        </Link>
      </div>

      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          Administration
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Modifier {target.firstName} {target.lastName}
        </h1>
        <p className="text-trail">
          Les changements sont tracés dans le journal d&apos;audit.
        </p>
      </header>

      <UserAccountForm
        user={{
          id: target.id,
          firstName: target.firstName,
          lastName: target.lastName,
          email: target.email,
          phone: target.phone,
          canLogin: target.canLogin,
        }}
      />

      <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
        <div>
          <h2 className="text-lg font-black text-earth">Gestion du compte</h2>
          <p className="text-sm text-trail">
            Unité, rôles, statut et accès de {fullName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UnitEditor userId={target.id} currentUnit={target.unit} />
          <RolesEditor
            userId={target.id}
            currentRoles={roles}
            allowPrivileged={isAdmin}
          />
          {!isSelf && (
            suspended ? (
              <ReactivateButton userId={target.id} fullName={fullName} />
            ) : (
              <SuspendButton userId={target.id} fullName={fullName} />
            )
          )}
          {!isSelf && <ChangePasswordDialog userId={target.id} fullName={fullName} />}
          {!isSelf && (
            <DeleteUserButton
              userId={target.id}
              fullName={fullName}
              redirectTo="/admin/utilisateurs"
            />
          )}
        </div>
      </section>
    </div>
  );
}
