"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import {
  applyImport,
  buildImportPlan,
  filtersFromParams,
  productIdsForFilter,
  saveProduct,
  type ProductPayload,
} from "@/lib/admin-products";
import type { Row } from "@/lib/products-io";

function fail(e: unknown) {
  const err = e as { message?: string };
  return { ok: false as const, error: err?.message ?? "Error inesperado" };
}

function refresh() {
  revalidatePath("/admin/productos", "layout");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Editor individual
// ---------------------------------------------------------------------------

const payloadSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1, "El nombre es obligatorio").max(200),
  slug: z.string().max(100).optional(),
  description: z.string().max(10000).nullish(),
  category_id: z.uuid().nullish().or(z.literal("")),
  price: z.number().min(0, "Precio inválido"),
  compare_at_price: z.number().min(0).nullish(),
  status: z.enum(["draft", "active", "inactive"]),
  featured: z.boolean(),
  tags: z.array(z.string().max(50)).max(50),
  options: z.array(z.object({ name: z.string().max(50), values: z.array(z.string().max(80)).max(200) })).max(10),
  images: z.array(z.object({ id: z.uuid().optional(), url: z.url(), path: z.string().nullish(), alt: z.string().max(200).nullish() })).max(40),
  variants: z
    .array(
      z.object({
        id: z.uuid().optional(),
        options: z.record(z.string(), z.string()),
        sku: z.string().max(80).nullish(),
        price: z.number().min(0).nullish(),
        compare_at_price: z.number().min(0).nullish(),
        stock: z.number().int(),
        active: z.boolean(),
        image_url: z.string().nullish(),
      }),
    )
    .min(1, "Agregá al menos una variante")
    .max(1000),
});

export async function saveProductAction(payload: ProductPayload) {
  try {
    const profile = await assertStaff("products");
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
    const result = await saveProduct({ ...parsed.data, category_id: parsed.data.category_id || null } as ProductPayload, profile.id);
    refresh();
    return { ok: true as const, ...result };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProductAction(id: string) {
  try {
    await assertStaff("products");
    await deleteProducts([z.uuid().parse(id)]);
    refresh();
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

async function deleteProducts(ids: string[]) {
  const db = createAdminClient();
  const { data: imgs } = await db.from("product_images").select("path").in("product_id", ids).not("path", "is", null);
  const { error } = await db.from("products").delete().in("id", ids);
  if (error) throw error;
  const paths = (imgs ?? []).map((i) => i.path as string);
  if (paths.length) {
    const { data: stillUsed } = await db.from("product_images").select("path").in("path", paths);
    const used = new Set((stillUsed ?? []).map((u) => u.path));
    const orphan = paths.filter((p) => !used.has(p));
    if (orphan.length) await db.storage.from("products").remove(orphan);
  }
}

// ---------------------------------------------------------------------------
// Acciones masivas sobre una selección (o sobre todos los que cumplen el filtro)
// ---------------------------------------------------------------------------

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["draft", "active", "inactive"]) }),
  z.object({ action: z.literal("category"), category_id: z.uuid().nullable() }),
  z.object({ action: z.literal("featured"), featured: z.boolean() }),
  z.object({
    action: z.literal("price"),
    mode: z.enum(["percent", "amount", "set"]),
    value: z.number(),
    target: z.enum(["products", "variants", "both"]),
    round: z.number().min(0).default(0),
    compare_at: z.boolean().default(false),
  }),
  z.object({ action: z.literal("compare_at_clear") }),
  z.object({ action: z.literal("stock"), mode: z.enum(["set", "add"]), value: z.number().int() }),
  z.object({ action: z.literal("variants_active"), active: z.boolean() }),
  z.object({ action: z.literal("tags_add"), tags: z.array(z.string().min(1)).min(1) }),
  z.object({ action: z.literal("tags_remove"), tags: z.array(z.string().min(1)).min(1) }),
  z.object({ action: z.literal("delete") }),
]);

export type BulkInput = z.input<typeof bulkSchema>;

export async function bulkProductsAction(target: { ids?: string[]; filter?: string }, input: BulkInput) {
  try {
    const profile = await assertStaff("products");
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
    const op = parsed.data;
    const settings = await getSettings();

    let ids: string[];
    if (target.filter !== undefined) {
      const sp = Object.fromEntries(new URLSearchParams(target.filter));
      ids = await productIdsForFilter(filtersFromParams(sp), settings.low_stock_threshold);
    } else {
      ids = z.array(z.uuid()).parse(target.ids ?? []);
    }
    if (!ids.length) return { ok: false as const, error: "No hay productos seleccionados" };

    const db = createAdminClient();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

    for (const chunk of chunks) {
      switch (op.action) {
        case "status":
          await db.from("products").update({ status: op.status }).in("id", chunk).throwOnError();
          break;
        case "category":
          await db.from("products").update({ category_id: op.category_id }).in("id", chunk).throwOnError();
          break;
        case "featured":
          await db.from("products").update({ featured: op.featured }).in("id", chunk).throwOnError();
          break;
        case "price":
          await db
            .rpc("bulk_adjust_prices", {
              p_products: chunk,
              p_mode: op.mode,
              p_value: op.value,
              p_target: op.target,
              p_round: op.round,
              p_compare_at: op.compare_at,
            })
            .throwOnError();
          break;
        case "compare_at_clear":
          await db.from("products").update({ compare_at_price: null }).in("id", chunk).throwOnError();
          await db.from("product_variants").update({ compare_at_price: null }).in("product_id", chunk).throwOnError();
          break;
        case "stock": {
          const { data: vs } = await db.from("product_variants").select("id").in("product_id", chunk);
          const vids = (vs ?? []).map((v) => v.id);
          if (vids.length) {
            await db
              .rpc("bulk_set_stock", { p_variants: vids, p_mode: op.mode, p_value: op.value, p_note: "Acción masiva", p_actor: profile.id })
              .throwOnError();
          }
          break;
        }
        case "variants_active":
          await db.from("product_variants").update({ active: op.active }).in("product_id", chunk).throwOnError();
          break;
        case "tags_add":
        case "tags_remove": {
          const { data: rows } = await db.from("products").select("id, tags").in("id", chunk);
          for (const r of rows ?? []) {
            const set = new Set<string>(r.tags ?? []);
            for (const t of op.tags) {
              if (op.action === "tags_add") set.add(t.trim());
              else set.delete(t.trim());
            }
            await db.from("products").update({ tags: [...set] }).eq("id", r.id);
          }
          break;
        }
        case "delete":
          await deleteProducts(chunk);
          break;
      }
    }
    refresh();
    return { ok: true as const, count: ids.length };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Grilla de edición masiva
// ---------------------------------------------------------------------------

const gridSchema = z.object({
  products: z
    .array(
      z.object({
        id: z.uuid(),
        patch: z
          .object({
            name: z.string().min(1).max(200),
            category_id: z.uuid().nullable(),
            price: z.number().min(0),
            compare_at_price: z.number().min(0).nullable(),
            status: z.enum(["draft", "active", "inactive"]),
            featured: z.boolean(),
            tags: z.array(z.string()),
          })
          .partial(),
      }),
    )
    .max(5000),
  variants: z
    .array(
      z.object({
        id: z.uuid(),
        patch: z
          .object({
            sku: z.string().max(80).nullable(),
            price: z.number().min(0).nullable(),
            compare_at_price: z.number().min(0).nullable(),
            stock: z.number().int(),
            active: z.boolean(),
          })
          .partial(),
      }),
    )
    .max(20000),
});

export async function saveGridAction(input: z.input<typeof gridSchema>) {
  try {
    const profile = await assertStaff("products");
    const parsed = gridSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: `Dato inválido: ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}` };
    const db = createAdminClient();
    const errors: string[] = [];

    for (const p of parsed.data.products) {
      if (!Object.keys(p.patch).length) continue;
      const { error } = await db.from("products").update(p.patch).eq("id", p.id);
      if (error) errors.push(`Producto ${p.id.slice(0, 8)}: ${error.message}`);
    }
    for (const v of parsed.data.variants) {
      const { stock, ...rest } = v.patch;
      if (rest.sku !== undefined) rest.sku = rest.sku?.trim() || null;
      if (Object.keys(rest).length) {
        const { error } = await db.from("product_variants").update(rest).eq("id", v.id);
        if (error) {
          errors.push(error.code === "23505" ? `SKU "${rest.sku}" repetido` : error.message);
          continue;
        }
      }
      if (stock !== undefined) {
        const { error } = await db.rpc("set_stock", { p_variant: v.id, p_stock: stock, p_reason: "bulk", p_note: "Edición masiva", p_actor: profile.id });
        if (error) errors.push(error.message);
      }
    }
    refresh();
    if (errors.length) return { ok: false as const, error: `Se guardó con ${errors.length} error(es): ${errors.slice(0, 5).join("; ")}` };
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

const rowsSchema = z.array(z.record(z.string(), z.unknown())).max(20000);

export async function previewImportAction(rows: Row[], opts: { publishAll?: boolean }) {
  try {
    await assertStaff("products");
    const plan = await buildImportPlan(rowsSchema.parse(rows), opts);
    return {
      ok: true as const,
      summary: plan.summary,
      errors: plan.errors.slice(0, 500),
      errorCount: plan.errors.length,
      products: plan.products.slice(0, 300).map((p) => ({
        handle: p.handle,
        isNew: !p.existingId,
        name: p.patch.name,
        status: p.patch.status,
        variantsNew: p.variants.filter((v) => !v.existingId).length,
        variantsUpdated: p.variants.filter((v) => v.existingId).length,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function applyImportAction(rows: Row[], opts: { publishAll?: boolean; createCategories?: boolean }) {
  try {
    const profile = await assertStaff("products");
    const result = await applyImport(rowsSchema.parse(rows), opts, profile.id);
    refresh();
    return {
      ok: true as const,
      applied: result.applied,
      skipped: result.plan.errors.length,
      failures: result.failures,
      summary: result.plan.summary,
    };
  } catch (e) {
    return fail(e);
  }
}
