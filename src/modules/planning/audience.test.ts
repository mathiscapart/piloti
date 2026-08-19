// Tests de la règle d'audience d'un événement (US-P04). Elle décide qui peut
// s'inscrire : une régression ici laisse un jeune s'inscrire à l'événement
// d'une autre branche, ou l'en empêche à tort.

import { describe, expect, it } from "vitest";
import { isConcernedByEvent } from "./audience";

describe("isConcernedByEvent", () => {
  it("un événement de groupe (unit null) concerne tout le monde", () => {
    expect(isConcernedByEvent(null, "LOUVETEAUX")).toBe(true);
    expect(isConcernedByEvent(null, "PIONNIERS")).toBe(true);
    // Y compris un compte sans branche renseignée (un parent, par exemple).
    expect(isConcernedByEvent(null, null)).toBe(true);
  });

  it("un événement de branche ne concerne que cette branche", () => {
    expect(isConcernedByEvent("PIONNIERS", "PIONNIERS")).toBe(true);
    expect(isConcernedByEvent("PIONNIERS", "LOUVETEAUX")).toBe(false);
    expect(isConcernedByEvent("LOUVETEAUX", "SCOUTS")).toBe(false);
  });

  it("fail-closed : sans branche, on n'est concerné par aucune branche précise", () => {
    // Cas du parent qui tenterait de s'inscrire lui-même à la sortie de son
    // enfant : c'est l'ENFANT qui doit être concerné, pas lui.
    expect(isConcernedByEvent("LOUVETEAUX", null)).toBe(false);
  });
});
