import { describe, expect, it } from "vitest";

import { csvCell } from "./csv";

describe("csvCell", () => {
  it("entoure toujours la valeur de guillemets", () => {
    expect(csvCell("Martin")).toBe('"Martin"');
  });

  it("double les guillemets internes (RFC 4180)", () => {
    expect(csvCell('Jean "Jeannot" Martin')).toBe('"Jean ""Jeannot"" Martin"');
  });

  it("préserve les séparateurs et sauts de ligne dans la cellule", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("ligne1\nligne2")).toBe('"ligne1\nligne2"');
  });

  // CWE-1236 — le tableur évalue la cellule même entre guillemets.
  it.each(["=", "+", "-", "@"])("neutralise une formule commençant par %s", (c) => {
    expect(csvCell(`${c}WEBSERVICE("http://x")`)).toBe(
      `"'${c}WEBSERVICE(""http://x"")"`,
    );
  });

  it("neutralise aussi les préfixes tabulation et retour chariot", () => {
    expect(csvCell("\t=1+1")).toBe(`"'\t=1+1"`);
    expect(csvCell("\r=1+1")).toBe(`"'\r=1+1"`);
  });

  it("ne touche pas aux valeurs dont le déclencheur n'est pas en tête", () => {
    expect(csvCell("Jean-Pierre")).toBe('"Jean-Pierre"');
    expect(csvCell("2 + 2")).toBe('"2 + 2"');
    expect(csvCell("contact@piloti.fr")).toBe('"contact@piloti.fr"');
  });

  it("laisse la chaîne vide inchangée", () => {
    expect(csvCell("")).toBe('""');
  });
});
