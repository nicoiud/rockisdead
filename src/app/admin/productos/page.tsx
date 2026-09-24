import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { filtersFromParams, filtersToParams, listAdminProducts } from "@/lib/admin-products";
import { PRODUCT_STATUS_LABEL } from "@/lib/labels";
import type { Category } from "@/lib/types";
import { Button, ButtonLink, Input, PageTitle, Select } from "@/components/ui";
import { ProductTable } from "./product-table";

export const metadata: Metadata = { title: "Productos" };

export default async function AdminProductsPage(props: PageProps<"/admin/productos">) {
  await requireStaff("products");
  const sp = await props.searchParams;
  const filters = filtersFromParams(sp);
  const page = Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1;
  const settings = await getSettings();
  const [{ products, total, perPage }, { data: cats }] = await Promise.all([
    listAdminProducts(filters, { page, perPage: 50, lowThreshold: settings.low_stock_threshold }),
    createAdminClient().from("categories").select("*").order("sort_order").order("name"),
  ]);
  const categories = (cats ?? []) as Category[];
  const query = filtersToParams(filters).toString();
  const pages = Math.ceil(total / perPage);

  return (
    <div>
      <PageTitle
        actions={
          <>
            <ButtonLink href="/admin/productos/importar" variant="secondary">Importar</ButtonLink>
            <ButtonLink href={`/admin/productos/exportar?formato=xlsx${query ? `&${query}` : ""}`} prefetch={false} variant="secondary">Exportar filtrados</ButtonLink>
            <ButtonLink href={`/admin/productos/masivo${query ? `?${query}` : ""}`} variant="secondary">Edición masiva</ButtonLink>
            <ButtonLink href="/admin/productos/nuevo">+ Nuevo producto</ButtonLink>
          </>
        }
      >
        Productos
      </PageTitle>

      <form className="mb-4 grid gap-3 border border-neutral-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-8">
        <Input name="q" placeholder="Nombre o SKU" defaultValue={filters.q} className="lg:col-span-2" />
        <Select name="categoria" defaultValue={filters.category ?? ""}>
          <option value="">Todas las categorías</option>
          <option value="none">Sin categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="estado" defaultValue={filters.status ?? ""}>
          <option value="">Todos los estados</option>
          {Object.entries(PRODUCT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select name="stock" defaultValue={filters.stock ?? ""}>
          <option value="">Todo el stock</option>
          <option value="low">Stock bajo (≤ {settings.low_stock_threshold})</option>
          <option value="out">Agotados</option>
          <option value="in">Con stock</option>
        </Select>
        <div className="flex gap-2">
          <Input name="min" type="number" min={0} placeholder="$ mín" defaultValue={filters.minPrice} />
          <Input name="max" type="number" min={0} placeholder="$ máx" defaultValue={filters.maxPrice} />
        </div>
        <Select name="orden" defaultValue={filters.sort}>
          <option value="updated">Últimos editados</option>
          <option value="newest">Más nuevos</option>
          <option value="name">Nombre</option>
          <option value="price_asc">Menor precio</option>
          <option value="price_desc">Mayor precio</option>
          <option value="stock_asc">Menor stock</option>
        </Select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="destacado" value="1" defaultChecked={filters.featured} className="accent-black" /> Destacados</label>
          <Button type="submit">Filtrar</Button>
        </div>
      </form>

      <ProductTable
        products={products}
        total={total}
        filterQuery={query}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        lowThreshold={settings.low_stock_threshold}
      />

      {pages > 1 && (
        <nav className="mt-4 flex flex-wrap gap-1 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/productos?${query}${query ? "&" : ""}pagina=${p}`}
              className={`border px-3 py-1 ${p === page ? "border-black bg-black text-white" : "border-neutral-300 bg-white"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
