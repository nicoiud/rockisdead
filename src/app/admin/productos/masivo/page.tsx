import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { filtersFromParams, filtersToParams, listAdminProducts } from "@/lib/admin-products";
import type { ProductStatus } from "@/lib/types";
import { Alert, PageTitle } from "@/components/ui";
import { BulkGrid, type GridProduct } from "./bulk-grid";

export const metadata: Metadata = { title: "Edición masiva" };

const LIMIT = 500;

export default async function BulkEditPage(props: PageProps<"/admin/productos/masivo">) {
  await requireStaff("products");
  const sp = await props.searchParams;
  const filters = filtersFromParams(sp);
  const settings = await getSettings();
  const db = createAdminClient();
  const [{ products, total }, { data: cats }] = await Promise.all([
    listAdminProducts(filters, { page: 1, perPage: LIMIT, lowThreshold: settings.low_stock_threshold, select: "id" }),
    db.from("categories").select("id, name").order("sort_order").order("name"),
  ]);
  const ids = products.map((p) => p.id);

  type Row = {
    id: string; name: string; slug: string; category_id: string | null; price: number; compare_at_price: number | null;
    status: ProductStatus; featured: boolean; tags: string[];
    product_variants: { id: string; title: string; sku: string | null; price: number | null; compare_at_price: number | null; stock: number; active: boolean; position: number }[];
  };
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db
      .from("products")
      .select("id, name, slug, category_id, price, compare_at_price, status, featured, tags, product_variants(id, title, sku, price, compare_at_price, stock, active, position)")
      .in("id", ids.slice(i, i + 150));
    rows.push(...((data ?? []) as Row[]));
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const gridProducts: GridProduct[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    category_id: p.category_id,
    price: Number(p.price),
    compare_at_price: p.compare_at_price === null ? null : Number(p.compare_at_price),
    status: p.status,
    featured: p.featured,
    tags: p.tags.join(", "),
    variants: [...p.product_variants]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku ?? "",
        price: v.price === null ? null : Number(v.price),
        compare_at_price: v.compare_at_price === null ? null : Number(v.compare_at_price),
        stock: v.stock,
        active: v.active,
      })),
  }));
  const query = filtersToParams(filters).toString();

  return (
    <div>
      <PageTitle>Edición masiva</PageTitle>
      <p className="mb-4 text-sm text-neutral-600">
        Editá celdas directamente, seleccioná filas para aplicar un mismo valor a todas y guardá todo junto.
        Se muestran los productos del filtro actual del <Link href={`/admin/productos${query ? `?${query}` : ""}`} className="underline">listado</Link>.
      </p>
      {total > LIMIT && (
        <Alert tone="warning">
          El filtro tiene {total} productos; se muestran los primeros {LIMIT}. Filtrá más o usá la importación por Excel/CSV para cambios más grandes.
        </Alert>
      )}
      <BulkGrid products={gridProducts} categories={cats ?? []} />
    </div>
  );
}
