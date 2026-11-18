import { describe, expect, it } from "vitest";

import {
  DEFAULT_AFTER_LOGIN,
  MAX_NEXT_LENGTH,
  nextForLogin,
  safeNextPath,
} from "./safe-redirect";

describe("safeNextPath (#85)", () => {
  it.each([
    "/prets",
    "/prets?status=OVERDUE",
    "/prets?status=OVERDUE&page=2",
    "/planning/abc#x",
    "/finances/notes",
    "/compte",
    "/loginx",
    "/registered-stuff",
    "/apidoc",
  ])("accepte le chemin interne %s", (next) => {
    expect(safeNextPath(next)).toBe(next);
  });

  it.each([
    "",
    "prets",
    " /prets",
    // origines externes et schémas
    "//example.com",
    "//evil.com",
    "/\\example.com",
    "/\\/example.com",
    "/\\evil.com",
    "https://example.com",
    "https://evil.com",
    "http:/evil.com",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,x",
    // encodages
    "/%2f%2fevil.com",
    "/%2F%2Fevil.com",
    "/%5cevil.com",
    "/%5Cevil.com",
    "/%2f/evil.com",
    "/%09/evil.com",
    "/prets%E0%A4%A",
    // caractères de contrôle
    "/prets\n",
    "/\texample.com",
    "/\tevil.com",
    "/\nevil.com",
    "/\revil.com",
    "/\u0000evil.com",
    "/prets\u0000",
    // pages d'authentification et variantes
    "/login",
    "/login/",
    "/LOGIN",
    "/Setup",
    "/API/auth/sign-out",
    "/%6cogin",
    "/%61pi/auth/sign-out",
    "/login?next=/prets",
    "/register",
    "/reset-password",
    "/reset-password?token=x",
    "/forgot-password",
    "/setup",
    "/./login",
    "/prets/../login",
    // API et interne
    "/api/auth/sign-out",
    "/api",
    "/_next/static/x.js",
  ])("refuse %j et retombe sur le tableau de bord", (next) => {
    expect(safeNextPath(next)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["un nombre", 42],
    ["un objet", {}],
    ["un tableau", ["/prets"]],
    ["un Blob", new Blob(["/prets"])],
  ])("refuse une valeur non textuelle (%s)", (_label, next) => {
    expect(safeNextPath(next)).toBe(DEFAULT_AFTER_LOGIN);
  });

  describe("longueur maximale", () => {
    const pathOfLength = (n: number) => "/prets?q=" + "a".repeat(n - "/prets?q=".length);

    it("refuse une valeur très longue", () => {
      expect(safeNextPath("/prets?q=" + "a".repeat(5000))).toBe(DEFAULT_AFTER_LOGIN);
    });

    it("exporte MAX_NEXT_LENGTH = 2048", () => {
      expect(MAX_NEXT_LENGTH).toBe(2048);
    });

    it("accepte un chemin de longueur exactement MAX_NEXT_LENGTH", () => {
      const next = pathOfLength(MAX_NEXT_LENGTH);
      expect(next).toHaveLength(MAX_NEXT_LENGTH);
      expect(safeNextPath(next)).toBe(next);
    });

    it("refuse un chemin de longueur MAX_NEXT_LENGTH + 1", () => {
      const next = pathOfLength(MAX_NEXT_LENGTH + 1);
      expect(next).toHaveLength(MAX_NEXT_LENGTH + 1);
      expect(safeNextPath(next)).toBe(DEFAULT_AFTER_LOGIN);
    });
  });
});

describe("nextForLogin (#85)", () => {
  it("transporte le chemin et la requête", () => {
    expect(nextForLogin("/prets", "?status=OVERDUE")).toBe("/prets?status=OVERDUE");
    expect(nextForLogin("/finances/notes", "")).toBe("/finances/notes");
  });

  it("ne mémorise pas la racine", () => {
    expect(nextForLogin("/", "")).toBeNull();
    expect(nextForLogin("/", "?x=1")).toBeNull();
  });

  it("ne transporte pas une URL trop longue", () => {
    const search = "?q=" + "a".repeat(MAX_NEXT_LENGTH);
    expect(nextForLogin("/prets", search)).toBeNull();
  });

  it("ne transporte pas une page d'authentification", () => {
    expect(nextForLogin("/login", "?next=/prets")).toBeNull();
  });
});
