import { describe, expect, it } from "vitest";

import { passwordSchema } from "./password-policy";

describe("passwordSchema", () => {
  it("refuse un mot de passe sans majuscule ni chiffre", () => {
    expect(passwordSchema.safeParse("abcdefghijkl").success).toBe(false);
  });

  it("refuse un mot de passe de moins de 12 caractères", () => {
    expect(passwordSchema.safeParse("Abcdefghij1").success).toBe(false);
  });

  it("accepte 12 caractères avec majuscule, minuscule et chiffre", () => {
    expect(passwordSchema.safeParse("Abcdefghijk1").success).toBe(true);
  });
});
