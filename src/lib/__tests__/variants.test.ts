import { describe, expect, it } from "vitest";
import { combinations, normalizeOptions, optionsFromVariants, optionsKey, variantTitle } from "../variants";

describe("variantes", () => {
  it("genera todas las combinaciones", () => {
    const combos = combinations([
      { name: "Talle", values: ["S", "M"] },
      { name: "Color", values: ["Negro", "Blanco", "Rojo"] },
    ]);
    expect(combos).toHaveLength(6);
    expect(combos[0]).toEqual({ Talle: "S", Color: "Negro" });
  });

  it("sin opciones devuelve una variante única", () => {
    expect(combinations([])).toEqual([{}]);
  });

  it("normaliza opciones", () => {
    expect(
      normalizeOptions([
        { name: " Talle ", values: ["S", " s", "", "M"] },
        { name: "talle", values: ["L"] },
        { name: "Vacía", values: [" "] },
      ]),
    ).toEqual([{ name: "Talle", values: ["S", "M"] }]);
  });

  it("arma el título respetando el orden de opciones", () => {
    const opts = [
      { name: "Talle", values: ["L"] },
      { name: "Color", values: ["Negro"] },
    ];
    expect(variantTitle(opts, { Color: "Negro", Talle: "L" })).toBe("L / Negro");
  });

  it("clave independiente de orden y mayúsculas", () => {
    expect(optionsKey({ Talle: "L", Color: "Negro" })).toBe(optionsKey({ color: "negro", talle: "l" }));
  });

  it("reconstruye opciones desde variantes", () => {
    const base = [{ name: "Talle", values: ["S", "M", "L"] }];
    expect(optionsFromVariants(["Talle"], [{ Talle: "M" }, { Talle: "XL" }, { Talle: "S" }], base)).toEqual([
      { name: "Talle", values: ["S", "M", "XL"] },
    ]);
  });
});
