/**
 * Importación / exportación masiva de productos y variantes (CSV / Excel).
 *
 * Formato: una fila por variante. Las filas con el mismo `handle` forman un
 * producto. Los datos de producto pueden repetirse en cada fila o ir solo en
 * la primera. Se admite cualquier cantidad de opciones con columnas
 * `opcion1_nombre`, `opcion1_valor`, `opcion2_nombre`, `opcion2_valor`, ...
 *
 * Celda vacía = "no modificar" (en productos existentes) o valor por defecto
 * (en productos nuevos).
 */
import { slugify } from "./format";
import type { ProductOption, ProductStatus } from "./types";
import { optionsFromVariants, optionsKey, variantTitle } from "./variants";

export const BASE_COLUMNS = [
  "handle",
  "nombre",
  "descripcion",
  "categoria",
  "precio",
  "precio_anterior",
  "estado",
  "destacado",
  "etiquetas",
  "imagenes",
] as const;

export const VARIANT_COLUMNS = ["sku", "precio_variante", "precio_anterior_variante", "stock", "variante_activa"] as const;

export function optionColumns(count: number): string[] {
  const cols: string[] = [];
  for (let i = 1; i <= count; i++) cols.push(`opcion${i}_nombre`, `opcion${i}_valor`);
  return cols;
}

export function templateColumns(optionCount = 2): string[] {
  return [...BASE_COLUMNS, ...optionColumns(optionCount), ...VARIANT_COLUMNS];
}

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Parseo de valores
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Acepta "12345", "12.345", "12.345,50", "12345.5", "$ 12.345". */
export function parseNumber(v: unknown): number | null | "invalid" {
  if (typeof v === "number") return Number.isFinite(v) ? v : "invalid";
  let s = str(v).replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // separador de miles
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalid";
}

export function parseBool(v: unknown): boolean | null | "invalid" {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (["si", "sí", "s", "yes", "y", "true", "1", "x", "verdadero"].includes(s)) return true;
  if (["no", "n", "false", "0", "falso"].includes(s)) return false;
  return "invalid";
}

export function parseStatus(v: unknown): ProductStatus | null | "invalid" {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (["publicado", "activo", "active", "publicar", "visible"].includes(s)) return "active";
  if (["borrador", "draft"].includes(s)) return "draft";
  if (["oculto", "inactivo", "inactive", "despublicado", "pausado"].includes(s)) return "inactive";
  return "invalid";
}

const STATUS_EXPORT: Record<ProductStatus, string> = { active: "publicado", draft: "borrador", inactive: "oculto" };

function splitList(v: unknown, sep: RegExp): string[] {
  return str(v)
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normaliza encabezados: minúsculas, sin acentos, espacios => _ */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// ---------------------------------------------------------------------------
// Parseo de filas => productos
// ---------------------------------------------------------------------------

export interface ParsedVariant {
  row: number;
  options: Record<string, string>;
  sku?: string;
  price?: number | null; // null explícito no se usa: vacío = sin cambio
  compare_at_price?: number;
  stock?: number;
  active?: boolean;
}

export interface ParsedProduct {
  handle: string;
  rows: number[];
  name?: string;
  description?: string;
  category?: string;
  price?: number;
  compare_at_price?: number;
  status?: ProductStatus;
  featured?: boolean;
  tags?: string[];
  images?: string[];
  optionNames: string[];
  variants: ParsedVariant[];
}

export interface RowError {
  row: number;
  handle?: string;
  message: string;
}

export function parseRows(rawRows: Row[]): { products: ParsedProduct[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const byHandle = new Map<string, ParsedProduct>();

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2; // fila 1 = encabezados
    const r: Row = {};
    for (const [k, v] of Object.entries(raw)) r[normalizeHeader(k)] = v;

    const isEmpty = Object.values(r).every((v) => str(v) === "");
    if (isEmpty) return;

    const name = str(r.nombre);
    const handle = slugify(str(r.handle) || name);
    if (!handle) {
      errors.push({ row: rowNum, message: "Falta handle o nombre" });
      return;
    }

    let p = byHandle.get(handle);
    if (!p) {
      p = { handle, rows: [], optionNames: [], variants: [] };
      byHandle.set(handle, p);
    }
    p.rows.push(rowNum);
    const err = (message: string) => errors.push({ row: rowNum, handle, message });

    // Datos de producto: el primer valor no vacío gana
    if (name && p.name === undefined) p.name = name;
    if (str(r.descripcion) && p.description === undefined) p.description = str(r.descripcion);
    if (str(r.categoria) && p.category === undefined) p.category = str(r.categoria);

    const price = parseNumber(r.precio);
    if (price === "invalid" || (typeof price === "number" && price < 0)) err(`Precio inválido: "${str(r.precio)}"`);
    else if (price !== null && p.price === undefined) p.price = price;

    const cmp = parseNumber(r.precio_anterior);
    if (cmp === "invalid" || (typeof cmp === "number" && cmp < 0)) err(`Precio anterior inválido: "${str(r.precio_anterior)}"`);
    else if (cmp !== null && p.compare_at_price === undefined) p.compare_at_price = cmp;

    const status = parseStatus(r.estado);
    if (status === "invalid") err(`Estado inválido: "${str(r.estado)}" (usar publicado, borrador u oculto)`);
    else if (status && p.status === undefined) p.status = status;

    const featured = parseBool(r.destacado);
    if (featured === "invalid") err(`Destacado inválido: "${str(r.destacado)}" (usar si/no)`);
    else if (featured !== null && p.featured === undefined) p.featured = featured;

    if (str(r.etiquetas) && p.tags === undefined) p.tags = splitList(r.etiquetas, /[,;]/);
    if (str(r.imagenes) && p.images === undefined) p.images = splitList(r.imagenes, /[\s|,;]+/);

    // Opciones: cualquier cantidad de pares opcionN_nombre / opcionN_valor
    const optionPairs: { idx: number; name: string; value: string }[] = [];
    for (const key of Object.keys(r)) {
      const m = key.match(/^opcion(\d+)_nombre$/);
      if (!m) continue;
      const idx = Number(m[1]);
      const optName = str(r[key]);
      const optValue = str(r[`opcion${idx}_valor`]);
      if (optName || optValue) optionPairs.push({ idx, name: optName, value: optValue });
    }
    optionPairs.sort((a, b) => a.idx - b.idx);

    const values: Record<string, string> = {};
    const rowOptionNames: string[] = [];
    let optionsOk = true;
    for (const pair of optionPairs) {
      const optName = pair.name || p.optionNames[rowOptionNames.length] || "";
      if (!optName) {
        err(`Falta el nombre de la opción ${pair.idx}`);
        optionsOk = false;
        continue;
      }
      if (!pair.value) {
        err(`Falta el valor de la opción "${optName}"`);
        optionsOk = false;
        continue;
      }
      rowOptionNames.push(optName);
      values[optName] = pair.value;
    }
    if (!optionsOk) return;

    if (p.optionNames.length === 0 && rowOptionNames.length) {
      p.optionNames = rowOptionNames;
    } else if (rowOptionNames.length && rowOptionNames.join("|").toLowerCase() !== p.optionNames.join("|").toLowerCase()) {
      err(`Las opciones (${rowOptionNames.join(", ")}) no coinciden con las del producto (${p.optionNames.join(", ")})`);
      return;
    }

    const v: ParsedVariant = { row: rowNum, options: values };
    const sku = str(r.sku);
    if (sku) v.sku = sku;
    const vPrice = parseNumber(r.precio_variante);
    if (vPrice === "invalid" || (typeof vPrice === "number" && vPrice < 0)) err(`Precio de variante inválido: "${str(r.precio_variante)}"`);
    else if (vPrice !== null) v.price = vPrice;
    const vCmp = parseNumber(r.precio_anterior_variante);
    if (vCmp === "invalid") err(`Precio anterior de variante inválido`);
    else if (vCmp !== null) v.compare_at_price = vCmp;
    const stock = parseNumber(r.stock);
    if (stock === "invalid" || (typeof stock === "number" && !Number.isInteger(stock))) err(`Stock inválido: "${str(r.stock)}"`);
    else if (stock !== null) v.stock = stock;
    const active = parseBool(r.variante_activa);
    if (active === "invalid") err(`variante_activa inválido (usar si/no)`);
    else if (active !== null) v.active = active;

    // ¿Hay algo de variante en esta fila?
    const hasVariantData =
      Object.keys(values).length > 0 || v.sku !== undefined || v.price !== undefined || v.stock !== undefined ||
      v.active !== undefined || v.compare_at_price !== undefined;
    if (hasVariantData) {
      const key = optionsKey(values);
      const dup = p.variants.find((x) => (v.sku && x.sku === v.sku) || optionsKey(x.options) === key);
      if (dup) err(`Variante repetida (ya definida en la fila ${dup.row})`);
      else p.variants.push(v);
    }
  });

  // Validaciones por producto
  for (const p of byHandle.values()) {
    for (const v of p.variants) {
      if (Object.keys(v.options).length !== p.optionNames.length) {
        errors.push({ row: v.row, handle: p.handle, message: `La variante debe tener valores para: ${p.optionNames.join(", ")}` });
      }
    }
  }

  // SKU repetidos entre productos
  const skuSeen = new Map<string, string>();
  for (const p of byHandle.values()) {
    for (const v of p.variants) {
      if (!v.sku) continue;
      const other = skuSeen.get(v.sku.toLowerCase());
      if (other && other !== p.handle) errors.push({ row: v.row, handle: p.handle, message: `SKU "${v.sku}" repetido en "${other}"` });
      skuSeen.set(v.sku.toLowerCase(), p.handle);
    }
  }

  return { products: [...byHandle.values()], errors };
}

// ---------------------------------------------------------------------------
// Plan de importación (qué se crea / actualiza), sin tocar la base
// ---------------------------------------------------------------------------

export interface ExistingVariant {
  id: string;
  sku: string | null;
  options: Record<string, string>;
  stock: number;
  position: number;
}

export interface ExistingProduct {
  id: string;
  slug: string;
  options: ProductOption[];
  variants: ExistingVariant[];
}

export interface PlannedVariant {
  existingId?: string;
  row: number;
  options: Record<string, string>;
  title: string;
  patch: { sku?: string; price?: number; compare_at_price?: number; active?: boolean };
  stock?: number; // stock absoluto a fijar
  position: number;
}

export interface PlannedProduct {
  handle: string;
  existingId?: string;
  patch: {
    name?: string;
    description?: string;
    category?: string;
    price?: number;
    compare_at_price?: number;
    status?: ProductStatus;
    featured?: boolean;
    tags?: string[];
  };
  images?: string[];
  options: ProductOption[];
  optionsChanged: boolean;
  variants: PlannedVariant[];
}

export interface ImportPlan {
  products: PlannedProduct[];
  errors: RowError[];
  summary: { productsNew: number; productsUpdated: number; variantsNew: number; variantsUpdated: number };
}

export function planImport(
  parsed: { products: ParsedProduct[]; errors: RowError[] },
  existing: ExistingProduct[],
  skuOwners: Map<string, string>, // sku (minúsculas) => product id
  opts: { publishAll?: boolean } = {},
): ImportPlan {
  const errors = [...parsed.errors];
  const bySlug = new Map(existing.map((p) => [p.slug, p]));
  const errorRows = new Set(errors.map((e) => e.row));
  const out: PlannedProduct[] = [];

  for (const p of parsed.products) {
    // Si alguna fila del producto tiene error, se omite el producto entero
    if (p.rows.some((r) => errorRows.has(r))) continue;

    const ex = bySlug.get(p.handle);
    const productErrors: RowError[] = [];

    if (!ex) {
      if (!p.name) productErrors.push({ row: p.rows[0], handle: p.handle, message: "Producto nuevo sin nombre" });
      if (p.price === undefined) productErrors.push({ row: p.rows[0], handle: p.handle, message: "Producto nuevo sin precio" });
    }

    // Nombres de opciones: si el producto existe y no se mandan opciones, se conservan
    let optionNames = p.optionNames;
    if (ex && optionNames.length === 0 && p.variants.length > 0 && ex.options.length > 0) {
      // Variantes sin opciones solo pueden identificarse por SKU
      optionNames = ex.options.map((o) => o.name);
    }
    if (ex && p.optionNames.length > 0 && ex.options.length > 0) {
      const same = ex.options.map((o) => o.name.toLowerCase()).join("|") === p.optionNames.map((n) => n.toLowerCase()).join("|");
      if (!same) {
        productErrors.push({
          row: p.rows[0],
          handle: p.handle,
          message: `Las opciones (${p.optionNames.join(", ")}) no coinciden con las existentes (${ex.options.map((o) => o.name).join(", ")}). Editá las opciones desde el producto.`,
        });
      }
    }

    const planned: PlannedVariant[] = [];
    const exVariants = ex?.variants ?? [];
    let nextPosition = exVariants.reduce((m, v) => Math.max(m, v.position + 1), 0);

    for (const v of p.variants) {
      let match: ExistingVariant | undefined;
      if (v.sku) match = exVariants.find((x) => x.sku?.toLowerCase() === v.sku!.toLowerCase());
      if (!match && Object.keys(v.options).length > 0) {
        match = exVariants.find((x) => optionsKey(x.options) === optionsKey(v.options));
      }
      if (!match && Object.keys(v.options).length === 0 && optionNames.length === 0 && exVariants.length === 1) {
        match = exVariants[0]; // producto sin variantes
      }

      if (v.sku) {
        const owner = skuOwners.get(v.sku.toLowerCase());
        if (owner && owner !== ex?.id) {
          productErrors.push({ row: v.row, handle: p.handle, message: `El SKU "${v.sku}" ya pertenece a otro producto` });
          continue;
        }
      }

      if (!match && Object.keys(v.options).length !== optionNames.length) {
        productErrors.push({ row: v.row, handle: p.handle, message: "No se encontró la variante (indicá SKU u opciones)" });
        continue;
      }

      const options = match && Object.keys(v.options).length === 0 ? match.options : v.options;
      const patch: PlannedVariant["patch"] = {};
      if (v.sku !== undefined) patch.sku = v.sku;
      if (v.price !== undefined && v.price !== null) patch.price = v.price;
      if (v.compare_at_price !== undefined) patch.compare_at_price = v.compare_at_price;
      if (v.active !== undefined) patch.active = v.active;

      planned.push({
        existingId: match?.id,
        row: v.row,
        options,
        title: "",
        patch,
        stock: v.stock ?? (match ? undefined : 0),
        position: match ? match.position : nextPosition++,
      });
    }

    // Producto nuevo sin filas de variante => variante única
    if (!ex && planned.length === 0 && optionNames.length === 0) {
      planned.push({ row: p.rows[0], options: {}, title: "", patch: {}, stock: 0, position: 0 });
    }
    if (!ex && planned.length === 0) {
      productErrors.push({ row: p.rows[0], handle: p.handle, message: "Producto nuevo sin variantes" });
    }

    if (productErrors.length) {
      errors.push(...productErrors);
      continue;
    }

    // Opciones finales = existentes + nuevas usadas
    const allVariantOptions = [
      ...exVariants.filter((x) => !planned.some((pv) => pv.existingId === x.id)).map((x) => x.options),
      ...planned.map((pv) => pv.options),
    ];
    const options = optionsFromVariants(optionNames, allVariantOptions, ex?.options ?? []);
    for (const pv of planned) pv.title = variantTitle(options, pv.options);
    const optionsChanged = JSON.stringify(options) !== JSON.stringify(ex?.options ?? []);

    const patch: PlannedProduct["patch"] = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.description !== undefined) patch.description = p.description;
    if (p.category !== undefined) patch.category = p.category;
    if (p.price !== undefined) patch.price = p.price;
    if (p.compare_at_price !== undefined) patch.compare_at_price = p.compare_at_price;
    if (p.status !== undefined) patch.status = p.status;
    if (p.featured !== undefined) patch.featured = p.featured;
    if (p.tags !== undefined) patch.tags = p.tags;
    if (opts.publishAll) patch.status = "active";

    out.push({ handle: p.handle, existingId: ex?.id, patch, images: p.images, options, optionsChanged, variants: planned });
  }

  return {
    products: out,
    errors: errors.sort((a, b) => a.row - b.row),
    summary: {
      productsNew: out.filter((p) => !p.existingId).length,
      productsUpdated: out.filter((p) => p.existingId).length,
      variantsNew: out.reduce((n, p) => n + p.variants.filter((v) => !v.existingId).length, 0),
      variantsUpdated: out.reduce((n, p) => n + p.variants.filter((v) => v.existingId).length, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Exportación (mismo formato => se puede editar en Excel y volver a importar)
// ---------------------------------------------------------------------------

export interface ExportProduct {
  slug: string;
  name: string;
  description: string | null;
  category_name: string | null;
  price: number;
  compare_at_price: number | null;
  status: ProductStatus;
  featured: boolean;
  tags: string[];
  options: ProductOption[];
  images: string[];
  variants: {
    options: Record<string, string>;
    sku: string | null;
    price: number | null;
    compare_at_price: number | null;
    stock: number;
    active: boolean;
  }[];
}

export function exportRows(products: ExportProduct[]): { columns: string[]; rows: Record<string, string | number>[] } {
  const maxOptions = Math.max(1, ...products.map((p) => p.options.length));
  const columns = templateColumns(maxOptions);
  const rows: Record<string, string | number>[] = [];

  for (const p of products) {
    const variants = p.variants.length ? p.variants : [null];
    for (const v of variants) {
      const row: Record<string, string | number> = {
        handle: p.slug,
        nombre: p.name,
        descripcion: p.description ?? "",
        categoria: p.category_name ?? "",
        precio: Number(p.price),
        precio_anterior: p.compare_at_price ?? "",
        estado: STATUS_EXPORT[p.status],
        destacado: p.featured ? "si" : "no",
        etiquetas: p.tags.join(", "),
        imagenes: p.images.join(" | "),
      };
      p.options.forEach((o, i) => {
        row[`opcion${i + 1}_nombre`] = o.name;
        row[`opcion${i + 1}_valor`] = v?.options[o.name] ?? "";
      });
      if (v) {
        row.sku = v.sku ?? "";
        row.precio_variante = v.price ?? "";
        row.precio_anterior_variante = v.compare_at_price ?? "";
        row.stock = v.stock;
        row.variante_activa = v.active ? "si" : "no";
      }
      for (const c of columns) if (!(c in row)) row[c] = "";
      rows.push(row);
    }
  }
  return { columns, rows };
}
