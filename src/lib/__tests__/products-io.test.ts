import { describe, expect, it } from "vitest";
import { exportRows, parseNumber, parseRows, planImport, type ExistingProduct } from "../products-io";

describe("parseNumber", () => {
  it.each([
    ["12345", 12345],
    ["12.345", 12345],
    ["12.345,50", 12345.5],
    ["12,5", 12.5],
    ["$ 1.234.567", 1234567],
    ["1,234.5", 1234.5],
    [99, 99],
    ["", null],
    ["abc", "invalid"],
  ])("%s => %s", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

const rows = [
  { handle: "remera-x", nombre: "Remera X", precio: "30.000", categoria: "Remeras", estado: "publicado",
    opcion1_nombre: "Talle", opcion1_valor: "S", opcion2_nombre: "Color", opcion2_valor: "Negro", sku: "RX-S-N", stock: "5" },
  { handle: "remera-x", opcion1_nombre: "Talle", opcion1_valor: "M", opcion2_nombre: "Color", opcion2_valor: "Negro", sku: "RX-M-N", stock: 3, precio_variante: "32000" },
  { Nombre: "Gorra Simple", Precio: "15000", Stock: "10" },
];

describe("parseRows", () => {
  it("agrupa filas por handle y admite encabezados con mayúsculas", () => {
    const { products, errors } = parseRows(rows);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(2);
    const [remera, gorra] = products;
    expect(remera.optionNames).toEqual(["Talle", "Color"]);
    expect(remera.variants).toHaveLength(2);
    expect(remera.variants[1]).toMatchObject({ sku: "RX-M-N", stock: 3, price: 32000 });
    expect(remera.price).toBe(30000);
    expect(gorra.handle).toBe("gorra-simple");
    expect(gorra.variants).toEqual([{ row: 4, options: {}, stock: 10 }]);
  });

  it("reporta errores con número de fila", () => {
    const { errors } = parseRows([
      { handle: "a", nombre: "A", precio: "xx" },
      { handle: "b", nombre: "B", precio: 1, estado: "cualquiera" },
      { handle: "c", nombre: "C", precio: 1, opcion1_nombre: "Talle", opcion1_valor: "" },
      { handle: "d", nombre: "D", precio: 1, opcion1_nombre: "Talle", opcion1_valor: "S" },
      { handle: "d", opcion1_nombre: "Talle", opcion1_valor: "S" },
    ]);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
  });

  it("admite cualquier cantidad de opciones", () => {
    const { products, errors } = parseRows([
      { nombre: "Jean", precio: 1, opcion1_nombre: "Talle", opcion1_valor: "40", opcion2_nombre: "Largo", opcion2_valor: "32",
        opcion3_nombre: "Lavado", opcion3_valor: "Oscuro", opcion4_nombre: "Calce", opcion4_valor: "Slim" },
    ]);
    expect(errors).toEqual([]);
    expect(products[0].optionNames).toEqual(["Talle", "Largo", "Lavado", "Calce"]);
  });
});

describe("planImport", () => {
  const existing: ExistingProduct[] = [
    {
      id: "p1",
      slug: "remera-x",
      options: [{ name: "Talle", values: ["S", "L"] }, { name: "Color", values: ["Negro"] }],
      variants: [
        { id: "v1", sku: "RX-S-N", options: { Talle: "S", Color: "Negro" }, stock: 1, position: 0 },
        { id: "v2", sku: null, options: { Talle: "L", Color: "Negro" }, stock: 1, position: 1 },
      ],
    },
  ];

  it("crea y actualiza productos y variantes", () => {
    const plan = planImport(parseRows(rows), existing, new Map([["rx-s-n", "p1"]]), { publishAll: true });
    expect(plan.errors).toEqual([]);
    expect(plan.summary).toEqual({ productsNew: 1, productsUpdated: 1, variantsNew: 2, variantsUpdated: 1 });
    const remera = plan.products.find((p) => p.handle === "remera-x")!;
    expect(remera.existingId).toBe("p1");
    expect(remera.variants[0]).toMatchObject({ existingId: "v1", stock: 5, title: "S / Negro" });
    expect(remera.variants[1]).toMatchObject({ existingId: undefined, stock: 3, position: 2, title: "M / Negro" });
    // Conserva valores existentes y agrega los nuevos
    expect(remera.options[0]).toEqual({ name: "Talle", values: ["S", "L", "M"] });
    expect(remera.patch.status).toBe("active");
    const gorra = plan.products.find((p) => p.handle === "gorra-simple")!;
    expect(gorra.variants).toEqual([expect.objectContaining({ options: {}, stock: 10, title: "" })]);
  });

  it("actualiza solo stock por SKU sin repetir opciones", () => {
    const plan = planImport(parseRows([{ handle: "remera-x", sku: "RX-S-N", stock: 9 }]), existing, new Map([["rx-s-n", "p1"]]));
    expect(plan.errors).toEqual([]);
    expect(plan.products[0].variants).toEqual([expect.objectContaining({ existingId: "v1", stock: 9, patch: { sku: "RX-S-N" } })]);
    expect(plan.products[0].patch).toEqual({});
    expect(plan.products[0].optionsChanged).toBe(false);
  });

  it("rechaza SKU de otro producto y producto nuevo sin precio", () => {
    const plan = planImport(
      parseRows([
        { handle: "otra", nombre: "Otra", precio: 1, sku: "RX-S-N" },
        { handle: "sin-precio", nombre: "Sin precio" },
      ]),
      existing,
      new Map([["rx-s-n", "p1"]]),
    );
    expect(plan.products).toEqual([]);
    expect(plan.errors.map((e) => e.message)).toEqual([
      'El SKU "RX-S-N" ya pertenece a otro producto',
      "Producto nuevo sin precio",
    ]);
  });

  it("rechaza opciones distintas a las existentes", () => {
    const plan = planImport(
      parseRows([{ handle: "remera-x", opcion1_nombre: "Medida", opcion1_valor: "1" }]),
      existing,
      new Map(),
    );
    expect(plan.errors).toHaveLength(1);
  });
});

describe("exportRows", () => {
  it("exporta y se puede reimportar sin cambios de estructura", () => {
    const { rows: out, columns } = exportRows([
      {
        slug: "remera-x", name: "Remera X", description: null, category_name: "Remeras", price: 30000,
        compare_at_price: null, status: "active", featured: true, tags: ["nuevo"],
        options: [{ name: "Talle", values: ["S"] }], images: ["https://x/1.jpg", "https://x/2.jpg"],
        variants: [{ options: { Talle: "S" }, sku: "RX-S", price: null, compare_at_price: null, stock: 4, active: true }],
      },
    ]);
    expect(columns).toContain("opcion1_nombre");
    const reparsed = parseRows(out);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.products[0]).toMatchObject({
      handle: "remera-x", status: "active", featured: true, tags: ["nuevo"], images: ["https://x/1.jpg", "https://x/2.jpg"],
    });
    expect(reparsed.products[0].variants[0]).toMatchObject({ sku: "RX-S", stock: 4, active: true });
  });
});
