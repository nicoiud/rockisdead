import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Category, Product, ProductImage, ProductOverview, ProductVariant } from "@/lib/types";

// Las consultas del catálogo usan el cliente con sesión: RLS garantiza que
// solo se vean productos publicados (o todo, si es staff).

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("active", true).order("sort_order").order("name");
  return (data ?? []) as Category[];
});

export type SortKey = "relevance" | "newest" | "price_asc" | "price_desc" | "name";

export const SORT_LABEL: Record<SortKey, string> = {
  relevance: "Relevancia",
  newest: "Más nuevos",
  price_asc: "Menor precio",
  price_desc: "Mayor precio",
  name: "Nombre",
};

export interface ProductQuery {
  category?: string; // slug
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortKey;
  page?: number;
  perPage?: number;
  featured?: boolean;
  inStock?: boolean;
}

export async function listProducts(query: ProductQuery) {
  const supabase = await createClient();
  const perPage = query.perPage ?? 24;
  const page = Math.max(1, query.page ?? 1);

  let q = supabase.from("product_overview").select("*", { count: "exact" }).eq("status", "active");
  if (query.category) q = q.eq("category_slug", query.category);
  if (query.q) {
    const term = query.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (query.minPrice !== undefined) q = q.gte("min_price", query.minPrice);
  if (query.maxPrice !== undefined) q = q.lte("min_price", query.maxPrice);
  if (query.featured) q = q.eq("featured", true);
  if (query.inStock) q = q.gt("total_stock", 0);

  switch (query.sort) {
    case "price_asc":
      q = q.order("min_price", { ascending: true });
      break;
    case "price_desc":
      q = q.order("min_price", { ascending: false });
      break;
    case "name":
      q = q.order("name", { ascending: true });
      break;
    case "newest":
      q = q.order("published_at", { ascending: false, nullsFirst: false });
      break;
    default:
      // Relevancia: destacados, con stock, más nuevos
      q = q.order("featured", { ascending: false }).order("total_stock", { ascending: false }).order("published_at", { ascending: false, nullsFirst: false });
  }

  const { data, count } = await q.range((page - 1) * perPage, page * perPage - 1);
  return { products: (data ?? []) as ProductOverview[], total: count ?? 0, page, perPage };
}

export interface ProductDetail extends Product {
  images: ProductImage[];
  variants: ProductVariant[];
  category: { name: string; slug: string } | null;
}

export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*, images:product_images(*), variants:product_variants(*), category:categories(name, slug)")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const p = data as ProductDetail;
  p.images.sort((a, b) => a.position - b.position);
  p.variants = p.variants.filter((v) => v.active).sort((a, b) => a.position - b.position);
  return p;
});
