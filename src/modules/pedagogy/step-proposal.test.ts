import { describe, expect, it } from "vitest";

import { stepConfirmationError, stepProposalError } from "./step-proposal";

describe("stepProposalError — étape proposable pour un jeune (#100)", () => {
  const step = (unit: string, archived = false) => ({ unit, archived });

  it("accepte une étape active de la branche du jeune", () => {
    expect(stepProposalError(step("PIONNIERS"), "PIONNIERS")).toBeNull();
  });

  it("refuse une étape d'une autre branche", () => {
    expect(stepProposalError(step("SCOUTS"), "PIONNIERS")).toBe(
      "Cette étape n'appartient pas à la branche de ce jeune.",
    );
  });

  it("refuse toute étape pour un jeune sans branche", () => {
    expect(stepProposalError(step("PIONNIERS"), null)).toBe(
      "Cette étape n'appartient pas à la branche de ce jeune.",
    );
  });

  it("refuse une étape archivée de la branche du jeune", () => {
    expect(stepProposalError(step("PIONNIERS", true), "PIONNIERS")).toBe(
      "Cette étape est archivée : elle ne peut plus être validée.",
    );
  });
});

describe("stepConfirmationError — proposition confirmable par un 2e chef (#152)", () => {
  const step = (unit: string, archived = false) => ({ unit, archived });
  const proposed = { status: "PROPOSED", proposedById: "chef-a" };

  it("accepte une proposition sur une étape active de la branche, par un autre chef", () => {
    expect(stepConfirmationError(proposed, step("PIONNIERS"), "PIONNIERS", "chef-b")).toBeNull();
  });

  it("refuse une étape déjà confirmée", () => {
    expect(
      stepConfirmationError(
        { status: "CONFIRMED", proposedById: "chef-a" },
        step("PIONNIERS"),
        "PIONNIERS",
        "chef-b",
      ),
    ).toBe("Étape déjà validée.");
  });

  it("refuse que le proposeur confirme lui-même", () => {
    expect(stepConfirmationError(proposed, step("PIONNIERS"), "PIONNIERS", "chef-a")).toBe(
      "Un autre chef doit confirmer cette étape (validation à 2).",
    );
  });

  it("refuse une étape archivée entre la proposition et la confirmation", () => {
    expect(stepConfirmationError(proposed, step("PIONNIERS", true), "PIONNIERS", "chef-b")).toBe(
      "Cette étape est archivée : elle ne peut plus être validée.",
    );
  });

  it("refuse une proposition hors branche créée avant #100", () => {
    expect(stepConfirmationError(proposed, step("SCOUTS"), "PIONNIERS", "chef-b")).toBe(
      "Cette étape n'appartient pas à la branche de ce jeune.",
    );
  });

  it("accepte une proposition dont le proposeur a été anonymisé", () => {
    expect(
      stepConfirmationError(
        { status: "PROPOSED", proposedById: null },
        step("PIONNIERS"),
        "PIONNIERS",
        "chef-b",
      ),
    ).toBeNull();
  });
});
