import { describe, expect, it } from "vitest";

import { stepProposalError } from "./step-proposal";

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
      "Cette étape est archivée : elle ne peut plus être proposée.",
    );
  });
});
