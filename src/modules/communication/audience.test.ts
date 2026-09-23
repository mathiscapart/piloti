// Tests de src/modules/communication/audience.ts — audience d'une annonce,
// source unique des destinataires, de la visibilité et du compteur de lecture
// (issue #111 : les parents notifiés ne voyaient pas l'annonce d'unité), et
// périmètre de publication (#112, D-024) : une régression ici laisse un chef
// notifier — voire en urgent, email et push forcés — les familles d'une autre
// branche ou tout le groupe.

import { describe, expect, it } from "vitest";

import {
  audienceUserIds,
  type AudienceUser,
  canPublishAnnouncementTo,
  type FamilyEdge,
} from "./audience";

function user(id: string, roles: string[], unit: string | null = null): AudienceUser {
  return { id, role: roles[0] ?? "SCOUT", roles, unit };
}

const chefPio = user("chef-pio", ["CHEF"], "PIONNIERS");
const elise = user("elise", ["SCOUT"], "PIONNIERS");
const mereElise = user("mere-elise", ["PARENT"]);
const scout = user("scout", ["SCOUT"], "SCOUTS");
const pereScout = user("pere-scout", ["PARENT"]);
const chefScouts = user("chef-scouts", ["CHEF"], "SCOUTS");
const admin = user("admin", ["ADMIN"]);

const users = [chefPio, elise, mereElise, scout, pereScout, chefScouts, admin];
const links: FamilyEdge[] = [
  { parentId: "mere-elise", childId: "elise" },
  { parentId: "pere-scout", childId: "scout" },
];

describe("audienceUserIds", () => {
  it("annonce d'unité : jeunes, leurs parents et encadrement de l'unité", () => {
    expect(audienceUserIds(users, links, "PIONNIERS").sort()).toEqual(
      ["chef-pio", "elise", "mere-elise"],
    );
  });

  it("annonce d'unité : exclut le parent d'un jeune d'une autre unité", () => {
    const ids = audienceUserIds(users, links, "PIONNIERS");
    expect(ids).not.toContain("pere-scout");
    expect(ids).not.toContain("chef-scouts");
    expect(ids).not.toContain("admin");
  });

  it("exclut l'auteur", () => {
    expect(audienceUserIds(users, links, "PIONNIERS", "chef-pio")).not.toContain(
      "chef-pio",
    );
  });

  it("ignore un lien familial vers un parent absent de la liste (inactif)", () => {
    const ids = audienceUserIds([chefPio, elise], links, "PIONNIERS");
    expect(ids.sort()).toEqual(["chef-pio", "elise"]);
  });

  it("un parent n'hérite pas de l'unité d'un enfant non SCOUT", () => {
    const aide = user("aide", ["CHEF"], "PIONNIERS");
    const ids = audienceUserIds(
      [aide, mereElise],
      [{ parentId: "mere-elise", childId: "aide" }],
      "PIONNIERS",
    );
    expect(ids).toEqual(["aide"]);
  });

  it("un parent membre de l'unité n'est compté qu'une fois", () => {
    const chefParent = user("chef-parent", ["CHEF", "PARENT"], "PIONNIERS");
    const ids = audienceUserIds(
      [chefParent, elise],
      [{ parentId: "chef-parent", childId: "elise" }],
      "PIONNIERS",
    );
    expect(ids.sort()).toEqual(["chef-parent", "elise"]);
  });

  it("un parent de deux enfants est dans l'audience des deux unités", () => {
    const deux = [...links, { parentId: "mere-elise", childId: "scout" }];
    expect(audienceUserIds(users, deux, "PIONNIERS")).toContain("mere-elise");
    expect(audienceUserIds(users, deux, "SCOUTS")).toContain("mere-elise");
  });

  it("ALL : tout le monde ; PARENTS : les seuls parents", () => {
    expect(audienceUserIds(users, links, "ALL")).toHaveLength(users.length);
    expect(audienceUserIds(users, links, "PARENTS").sort()).toEqual([
      "mere-elise",
      "pere-scout",
    ]);
  });
});

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
