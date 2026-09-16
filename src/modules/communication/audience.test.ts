// Tests du périmètre de publication d'une annonce (#112, D-024). Une régression
// ici laisse un chef notifier — voire en urgent, email et push forcés — les
// familles d'une autre branche ou tout le groupe.

import { describe, expect, it } from "vitest";

import { canPublishAnnouncementTo } from "./audience";

const account = (roles: string[], unit: string | null = null) =>
  ({ role: roles[0], roles, unit, status: "ACTIVE" }) as const;

describe("canPublishAnnouncementTo", () => {
  const chefPio = account(["CHEF"], "PIONNIERS");

  it("un chef publie vers sa branche", () => {
    expect(canPublishAnnouncementTo(chefPio, "PIONNIERS")).toBe(true);
  });

  it("un chef ne publie pas vers une autre branche", () => {
    expect(canPublishAnnouncementTo(chefPio, "SCOUTS")).toBe(false);
  });

  it("un chef ne publie pas vers tout le groupe ni vers tous les parents", () => {
    expect(canPublishAnnouncementTo(chefPio, "ALL")).toBe(false);
    expect(canPublishAnnouncementTo(chefPio, "PARENTS")).toBe(false);
  });

  it("fail-closed : un chef sans branche ne publie nulle part", () => {
    const chefSansBranche = account(["CHEF"]);
    expect(canPublishAnnouncementTo(chefSansBranche, "PIONNIERS")).toBe(false);
    expect(canPublishAnnouncementTo(chefSansBranche, "ALL")).toBe(false);
  });

  it.each([["RESPONSABLE_GROUPE"], ["ADMIN"]])("%s publie partout", (role) => {
    for (const audience of ["ALL", "PARENTS", "SCOUTS", "PIONNIERS"]) {
      expect(canPublishAnnouncementTo(account([role]), audience)).toBe(true);
    }
  });

  it("un rôle sans droit de publication ne publie nulle part", () => {
    expect(canPublishAnnouncementTo(account(["PARENT"], "PIONNIERS"), "PIONNIERS")).toBe(false);
  });
});
