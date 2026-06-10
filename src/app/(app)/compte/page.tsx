import { UserCog } from "lucide-react";

import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { db } from "@/lib/db";
import { ROLE_LABEL, UNIT_LABEL, type Role, type Unit } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { effectiveRoles } from "@/lib/permissions";
import { vapidPublicKey } from "@/lib/push";

import {
  AvatarForm,
  PasswordForm,
  ProfileForm,
  SkillsProfileForm,
} from "./account-forms";

export default async function AccountPage() {
  const user = await getCurrentUser();
  const roles = effectiveRoles(user);
  const isParent = roles.includes("PARENT");
  const [pref, profile] = await Promise.all([
    db.notificationPreference.findUnique({
      where: { userId: user.id },
      select: { emailEnabled: true, pushEnabled: true },
    }),
    isParent
      ? db.user.findUnique({
          where: { id: user.id },
          select: {
            profession: true,
            skills: true,
            availability: true,
            helpNotes: true,
            skillsConsent: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <UserCog className="size-3.5" />
          Mon compte
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          {user.firstName} {user.lastName}
        </h1>
        <p className="text-trail">{user.email}</p>
      </header>

      {/* Rôles & branche — lecture seule (attribués par l'administration). */}
      <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Rôles &amp; branche</h2>
        <p className="text-sm text-earth">
          <span className="font-bold">Rôle(s) :</span>{" "}
          {roles.length > 0
            ? roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(", ")
            : "Aucun"}
        </p>
        <p className="text-sm text-earth">
          <span className="font-bold">Branche :</span>{" "}
          {user.unit ? (UNIT_LABEL[user.unit as Unit] ?? user.unit) : "—"}
        </p>
        <p className="text-xs text-trail">
          Ces informations sont gérées par un responsable. Contacte
          l&apos;administration pour toute modification.
        </p>
      </section>

      {/* Photo de profil — auto-service. La `key` force le remount après
          changement pour que l'aperçu reflète la photo enregistrée côté serveur. */}
      <AvatarForm
        key={user.image ?? "none"}
        image={user.image ?? null}
        firstName={user.firstName}
        lastName={user.lastName}
      />

      {/* Coordonnées — éditable par l'utilisateur. */}
      <ProfileForm
        firstName={user.firstName}
        lastName={user.lastName}
        phone={user.phone ?? ""}
      />

      {/* US-26 — compétences renseignées par le parent lui-même. */}
      {isParent ? (
        <SkillsProfileForm
          profession={profile?.profession ?? ""}
          skills={profile?.skills ?? ""}
          availability={profile?.availability ?? ""}
          helpNotes={profile?.helpNotes ?? ""}
          skillsConsent={profile?.skillsConsent ?? false}
        />
      ) : null}

      {/* Mot de passe — auto-service via better-auth. */}
      <PasswordForm />

      {/* Préférences de notification — email / push (US notification & communication). */}
      <NotificationSettings
        emailEnabled={pref?.emailEnabled ?? true}
        pushEnabled={pref?.pushEnabled ?? true}
        vapidPublicKey={vapidPublicKey()}
      />
    </div>
  );
}
