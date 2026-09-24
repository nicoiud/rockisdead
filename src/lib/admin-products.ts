import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/format";
import { normalizeOptions, optionsKey, variantTitle } from "@/lib/variants";
import {
  parseRows,
  planImport,
  type ExistingProduct,
  type ImportPlan,
  type Row,
} from "@/lib/products-io";
import type { ProductOption, ProductOverview, ProductStatus } from "@/lib/types";

type Db = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Filtros del listado (compartidos por listado, grilla, exportación y acciones "todos los filtrados")
// ---------------------------------------------------------------------------

export interface ProductFilters {
  q?: string;
  category?: string; // id o "none"
  status?: ProductStatus;
  stock?: "low" | "out" | "in";
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  sort?: "updated" | "name" | "price_asc" | "price_desc" | "stock_asc" | "newest";
}

export function filtersFromParams(sp: Record<string, string | string[] | undefined>): ProductFilters {
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);
  const n = (k: string) => {
    const v = s(k);
    const num = v === undefined ? NaN : Number(v);
    return Number.isFinite(num) ? num : undefined;
  };
  const status = s("estado");
  const stock = s("stock");
  return {
    q: s("q"),
    category: s("categoria"),
    status: status && ["draft", "active", "inactive"].includes(status) ? (status as ProductStatus) : undefined,
    stock: stock && ["low", "out", "in"].includes(stock) ? (stock as ProductFilters["stock"]) : undefined,
    minPrice: n("min"),
    maxPrice: n("max"),
    featured: s("destacado") === "1" ? true : undefined,
    sort: (s("orden") as ProductFilters["sort"]) ?? "updated",
  };
}

export function filtersToParams(f: ProductFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("categoria", f.category);
  if (f.status) p.set("estado", f.status);
  if (f.stock) p.set("stock", f.stock);
  if (f.minPrice !== undefined) p.set("min", String(f.minPrice));
  if (f.maxPrice !== undefined) p.set("max", String(f.maxPrice));
  if (f.featured) p.set("destacado", "1");
  if (f.sort && f.sort !== "updated") p.set("orden", f.sort);
  return p;
}

export async function listAdminProducts(
  f: ProductFilters,
  opts: { page?: number; perPage?: number; lowThreshold: number; select?: string },
) {
  const db = createAdminClient();
  let q = db.from("product_overview").select(opts.select ?? "*", { count: "exact" });
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) {
      // Busca también por SKU de variantes
      const { data: bySku } = await db.from("product_variants").select("product_id").ilike("sku", `%${term}%`).limit(200);
      const ids = [...new Set((bySku ?? []).map((r) => r.product_id))];
      q = q.or(`name.ilike.%${term}%,slug.ilike.%${term}%${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
    }
  }
  if (f.category === "none") q = q.is("category_id", null);
  else if (f.category) q = q.eq("category_id", f.category);
  if (f.status) q = q.eq("status", f.status);
  if (f.stock === "out") q = q.lte("total_stock", 0);
  if (f.stock === "in") q = q.gt("total_stock", 0);
  if (f.stock === "low") q = q.lte("min_stock", opts.lowThreshold);
  if (f.minPrice !== undefined) q = q.gte("min_price", f.minPrice);
  if (f.maxPrice !== undefined) q = q.lte("min_price", f.maxPrice);
  if (f.featured) q = q.eq("featured", true);

  switch (f.sort) {
    case "name": q = q.order("name"); break;
    case "price_asc": q = q.order("min_price"); break;
    case "price_desc": q = q.order("min_price", { ascending: false }); break;
    case "stock_asc": q = q.order("total_stock"); break;
    case "newest": q = q.order("created_at", { ascending: false }); break;
    default: q = q.order("updated_at", { ascending: false });
  }
  q = q.order("id");

  const perPage = opts.perPage ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const { data, count, error } = await q.range((page - 1) * perPage, page * perPage - 1);
  if (error) throw error;
  return { products: (data ?? []) as unknown as ProductOverview[], total: count ?? 0, page, perPage };
}

/** Todos los ids que cumplen el filtro (para acciones masivas sobre "todos los filtrados"). */
export async function productIdsForFilter(f: ProductFilters, lowThreshold: number): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const res = await listAdminProducts(f, { page, perPage: 1000, lowThreshold, select: "id" });
    ids.push(...res.products.map((p) => p.id));
    if (ids.length >= res.total || res.products.length === 0) break;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Guardado de producto (editor individual)
// ---------------------------------------------------------------------------

export interface ProductPayload {
  id?: string;
  name: string;
  slug?: string;
  description?: string | null;
  category_id?: string | null;
  price: number;
  compare_at_price?: number | null;
  status: ProductStatus;
  featured: boolean;
  tags: string[];
  options: ProductOption[];
  images: { id?: string; url: string; path?: string | null; alt?: string | null }[];
  variants: {
    id?: string;
    options: Record<string, string>;
    sku?: string | null;
    price?: number | null;
    compare_at_price?: number | null;
    stock: number;
    active: boolean;
    image_url?: string | null; // se resuelve al id de imagen luego de guardar imágenes
  }[];
}

export async function uniqueSlug(db: Db, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "producto";
  let slug = root;
  for (let i = 2; ; i++) {
    let q = db.from("products").select("id").eq("slug", slug);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
    slug = `${root}-${i}`;
  }
}

async function syncImages(db: Db, productId: string, images: ProductPayload["images"]) {
  const { data: current } = await db.from("product_images").select("id, url, path").eq("product_id", productId);
  const keepIds = new Set(images.filter((i) => i.id).map((i) => i.id));
  const byUrl = new Map((current ?? []).map((c) => [c.url, c]));
  const toDelete = (current ?? []).filter((c) => !keepIds.has(c.id) && !images.some((i) => !i.id && i.url === c.url));
  if (toDelete.length) {
    await db.from("product_images").delete().in("id", toDelete.map((d) => d.id));
    const paths = toDelete.map((d) => d.path).filter(Boolean) as string[];
    // Solo se borran del Storage si ya no los usa otro producto
    if (paths.length) {
      const { data: stillUsed } = await db.from("product_images").select("path").in("path", paths);
      const used = new Set((stillUsed ?? []).map((u) => u.path));
      const orphan = paths.filter((p) => !used.has(p));
      if (orphan.length) await db.storage.from("products").remove(orphan);
    }
  }
  const urlToId = new Map<string, string>();
  for (const [position, img] of images.entries()) {
    const existing = img.id ? { id: img.id } : byUrl.get(img.url);
    if (existing) {
      await db.from("product_images").update({ position, alt: img.alt ?? null }).eq("id", existing.id);
      urlToId.set(img.url, existing.id);
    } else {
      const { data } = await db
        .from("product_images")
        .insert({ product_id: productId, url: img.url, path: img.path ?? null, alt: img.alt ?? null, position })
        .select("id")
        .single();
      if (data) urlToId.set(img.url, data.id);
    }
  }
  return urlToId;
}

export async function saveProduct(payload: ProductPayload, actorId: string): Promise<{ id: string; slug: string }> {
  const db = createAdminClient();
  const options = normalizeOptions(payload.options);
  const name = payload.name.trim();
  if (!name) throw new Error("El nombre es obligatorio");
  if (!(payload.price >= 0)) throw new Error("Precio inválido");
  if (!payload.variants.length) throw new Error("El producto necesita al menos una variante");

  // Validar variantes contra opciones
  const seen = new Set<string>();
  for (const v of payload.variants) {
    for (const o of options) {
      if (!v.options[o.name] || !o.values.includes(v.options[o.name])) throw new Error(`Variante inválida: falta "${o.name}"`);
    }
    const key = optionsKey(v.options);
    if (seen.has(key)) throw new Error("Hay variantes repetidas");
    seen.add(key);
    if (!Number.isInteger(v.stock)) throw new Error("El stock debe ser un número entero");
  }
  const skus = payload.variants.map((v) => v.sku?.trim()).filter(Boolean) as string[];
  if (new Set(skus.map((s) => s.toLowerCase())).size !== skus.length) throw new Error("Hay SKUs repetidos");
  if (skus.length) {
    const { data: taken } = await db.from("product_variants").select("sku, product_id").in("sku", skus);
    const conflict = (taken ?? []).find((t) => t.product_id !== payload.id);
    if (conflict) throw new Error(`El SKU "${conflict.sku}" ya lo usa otro producto`);
  }

  const slug = await uniqueSlug(db, payload.slug?.trim() || name, payload.id);
  const row = {
    name,
    slug,
    description: payload.description?.trim() || null,
    category_id: payload.category_id || null,
    price: payload.price,
    compare_at_price: payload.compare_at_price || null,
    status: payload.status,
    featured: payload.featured,
    tags: payload.tags.map((t) => t.trim()).filter(Boolean),
    options,
  };

  let productId = payload.id;
  if (productId) {
    const { error } = await db.from("products").update(row).eq("id", productId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("products").insert(row).select("id").single();
    if (error) throw error;
    productId = data.id;
  }

  const urlToId = await syncImages(db, productId!, payload.images);

  // Variantes: borrar las que ya no están, actualizar, crear
  const { data: currentVariants } = await db.from("product_variants").select("id, stock").eq("product_id", productId!);
  const keep = new Set(payload.variants.filter((v) => v.id).map((v) => v.id));
  const removed = (currentVariants ?? []).filter((v) => !keep.has(v.id));
  if (removed.length) await db.from("product_variants").delete().in("id", removed.map((v) => v.id));

  for (const [position, v] of payload.variants.entries()) {
    const vRow = {
      product_id: productId!,
      options: Object.fromEntries(options.map((o) => [o.name, v.options[o.name]])),
      title: variantTitle(options, v.options),
      sku: v.sku?.trim() || null,
      price: v.price ?? null,
      compare_at_price: v.compare_at_price ?? null,
      active: v.active,
      position,
      image_id: v.image_url ? (urlToId.get(v.image_url) ?? null) : null,
    };
    if (v.id) {
      const { error } = await db.from("product_variants").update(vRow).eq("id", v.id).eq("product_id", productId!);
      if (error) throw new Error(error.code === "23505" ? "Variantes o SKU duplicados" : error.message);
      const before = currentVariants?.find((c) => c.id === v.id);
      if (before && before.stock !== v.stock) {
        await db.rpc("set_stock", { p_variant: v.id, p_stock: v.stock, p_reason: "manual", p_note: "Edición de producto", p_actor: actorId });
      }
    } else {
      const { data, error } = await db.from("product_variants").insert({ ...vRow, stock: 0 }).select("id").single();
      if (error) throw new Error(error.code === "23505" ? "Variantes o SKU duplicados" : error.message);
      if (v.stock !== 0) {
        await db.rpc("set_stock", { p_variant: data.id, p_stock: v.stock, p_reason: "initial", p_note: "Alta de variante", p_actor: actorId });
      }
    }
  }

  return { id: productId!, slug };
}

// ---------------------------------------------------------------------------
// Importación masiva
// ---------------------------------------------------------------------------

async function chunkedIn<T>(db: Db, table: string, select: string, column: string, values: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 150) {
    const { data, error } = await db.from(table).select(select).in(column, values.slice(i, i + 150));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export async function buildImportPlan(rows: Row[], opts: { publishAll?: boolean }): Promise<ImportPlan> {
  const db = createAdminClient();
  const parsed = parseRows(rows);
  const handles = parsed.products.map((p) => p.handle);
  const skus = parsed.products.flatMap((p) => p.variants.map((v) => v.sku).filter(Boolean) as string[]);

  const existingRows = await chunkedIn<{ id: string; slug: string; options: ProductOption[]; product_variants: ExistingProduct["variants"] }>(
    db, "products", "id, slug, options, product_variants(id, sku, options, stock, position)", "slug", handles,
  );
  const existing: ExistingProduct[] = existingRows.map((p) => ({ id: p.id, slug: p.slug, options: p.options, variants: p.product_variants }));
  const skuRows = await chunkedIn<{ sku: string; product_id: string }>(db, "product_variants", "sku, product_id", "sku", skus);
  const skuOwners = new Map(skuRows.map((r) => [r.sku.toLowerCase(), r.product_id]));
  return planImport(parsed, existing, skuOwners, opts);
}

export async function applyImport(
  rows: Row[],
  opts: { publishAll?: boolean; createCategories?: boolean },
  actorId: string,
): Promise<{ plan: ImportPlan; applied: number; failures: { handle: string; message: string }[] }> {
  const db = createAdminClient();
  const plan = await buildImportPlan(rows, opts);
  const failures: { handle: string; message: string }[] = [];

  const { data: cats } = await db.from("categories").select("id, name, slug");
  const categories = new Map<string, string>();
  for (const c of cats ?? []) {
    categories.set(c.name.toLowerCase(), c.id);
    categories.set(c.slug, c.id);
  }
  async function categoryId(name: string): Promise<string | null | undefined> {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const found = categories.get(key) ?? categories.get(slugify(name));
    if (found) return found;
    if (!opts.createCategories) return undefined;
    const { data } = await db.from("categories").insert({ name: name.trim(), slug: slugify(name) }).select("id").single();
    if (data) {
      categories.set(key, data.id);
      categories.set(slugify(name), data.id);
    }
    return data?.id ?? null;
  }

  let applied = 0;
  for (const p of plan.products) {
    try {
      const row: Record<string, unknown> = {};
      const patch = p.patch;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.price !== undefined) row.price = patch.price;
      if (patch.compare_at_price !== undefined) row.compare_at_price = patch.compare_at_price || null;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.featured !== undefined) row.featured = patch.featured;
      if (patch.tags !== undefined) row.tags = patch.tags;
      if (patch.category !== undefined) {
        const cid = await categoryId(patch.category);
        if (cid === undefined) throw new Error(`La categoría "${patch.category}" no existe`);
        row.category_id = cid;
      }
      if (!p.existingId || p.optionsChanged) row.options = p.options;

      let productId = p.existingId;
      if (!productId) {
        const { data, error } = await db
          .from("products")
          .insert({ ...row, slug: p.handle, status: row.status ?? "draft" })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
      } else if (Object.keys(row).length) {
        const { error } = await db.from("products").update(row).eq("id", productId);
        if (error) throw error;
      }

      if (p.images) {
        const { data: current } = await db.from("product_images").select("id, url").eq("product_id", productId!);
        await syncImages(
          db,
          productId!,
          p.images.map((url) => ({ id: current?.find((c) => c.url === url)?.id, url })),
        );
      }

      for (const v of p.variants) {
        const vRow: Record<string, unknown> = { options: v.options, title: v.title, position: v.position, ...v.patch };
        if (v.existingId) {
          const { error } = await db.from("product_variants").update(vRow).eq("id", v.existingId);
          if (error) throw error;
          if (v.stock !== undefined) {
            await db.rpc("set_stock", { p_variant: v.existingId, p_stock: v.stock, p_reason: "import", p_note: "Importación", p_actor: actorId });
          }
        } else {
          const { data, error } = await db.from("product_variants").insert({ ...vRow, product_id: productId, stock: 0 }).select("id").single();
          if (error) throw error;
          if (v.stock) {
            await db.rpc("set_stock", { p_variant: data.id, p_stock: v.stock, p_reason: "import", p_note: "Importación", p_actor: actorId });
          }
        }
      }
      applied++;
    } catch (e) {
      const err = e as { message?: string; code?: string };
      failures.push({ handle: p.handle, message: err.code === "23505" ? "SKU u opciones duplicadas" : (err.message ?? "Error") });
    }
  }
  return { plan, applied, failures };
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

export async function loadProductsForExport(ids: string[]) {
  const db = createAdminClient();
  type Row = {
    id: string; slug: string; name: string; description: string | null; price: number; compare_at_price: number | null;
    status: ProductStatus; featured: boolean; tags: string[]; options: ProductOption[]; updated_at: string;
    categories: { name: string } | null;
    product_images: { url: string; position: number }[];
    product_variants: { options: Record<string, string>; sku: string | null; price: number | null; compare_at_price: number | null; stock: number; active: boolean; position: number }[];
  };
  const rows = await chunkedIn<Row>(
    db,
    "products",
    "id, slug, name, description, price, compare_at_price, status, featured, tags, options, updated_at, categories(name), product_images(url, position), product_variants(options, sku, price, compare_at_price, stock, active, position)",
    "id",
    ids,
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return rows.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    category_name: p.categories?.name ?? null,
    price: Number(p.price),
    compare_at_price: p.compare_at_price === null ? null : Number(p.compare_at_price),
    status: p.status,
    featured: p.featured,
    tags: p.tags,
    options: p.options,
    images: [...p.product_images].sort((a, b) => a.position - b.position).map((i) => i.url),
    variants: [...p.product_variants]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        options: v.options,
        sku: v.sku,
        price: v.price === null ? null : Number(v.price),
        compare_at_price: v.compare_at_price === null ? null : Number(v.compare_at_price),
        stock: v.stock,
        active: v.active,
      })),
  }));
}
