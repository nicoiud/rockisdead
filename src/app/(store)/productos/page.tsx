import type { Metadata } from "next";
import Link from "next/link";
import { getCategories, listProducts, SORT_LABEL, type SortKey } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { Button, EmptyState, Input, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Productos" };

function num(v: string | string[] | undefined): number | undefined {
  const n = Number(typeof v === "string" ? v : undefined);
  return Number.isFinite(n) && n >= 0 && v !== "" ? n : undefined;
}

export default async function ProductsPage(props: PageProps<"/productos">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const sort = (str("orden") as SortKey) in SORT_LABEL ? (str("orden") as SortKey) : "relevance";
  const query = {
    category: str("categoria"),
    q: str("q"),
    minPrice: num(sp.min),
    maxPrice: num(sp.max),
    sort,
    page: num(sp.pagina) ?? 1,
    inStock: str("stock") === "1",
  };
  const [categories, result] = await Promise.all([getCategories(), listProducts(query)]);
  const current = categories.find((c) => c.slug === query.category);
  const pages = Math.ceil(result.total / result.perPage);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) params.set(k, v);
    params.set("pagina", String(p));
    return `/productos?${params}`;
  };

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <aside>
        <form className="space-y-4">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          <div>
            <p className="mb-2 text-xs font-bold uppercase">Categoría</p>
            <Select name="categoria" defaultValue={query.category ?? ""}>
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase">Precio</p>
            <div className="flex gap-2">
              <Input name="min" type="number" min={0} placeholder="Mín" defaultValue={query.minPrice} />
              <Input name="max" type="number" min={0} placeholder="Máx" defaultValue={query.maxPrice} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase">Ordenar por</p>
            <Select name="orden" defaultValue={sort}>
              {Object.entries(SORT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="stock" value="1" defaultChecked={query.inStock} className="accent-black" />
            Solo con stock
          </label>
          <Button type="submit" className="w-full">Filtrar</Button>
          <Link href="/productos" className="block text-center text-xs underline">Limpiar filtros</Link>
        </form>
      </aside>

      <section>
        <h1 className="mb-1 text-2xl font-black uppercase">{current?.name ?? (query.q ? `Resultados para “${query.q}”` : "Productos")}</h1>
        <p className="mb-6 text-sm text-neutral-500">{result.total} producto(s)</p>
        {result.products.length === 0 ? (
          <EmptyState>No encontramos productos con esos filtros.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
            {result.products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex justify-center gap-2 text-sm">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={pageHref(p)}
                className={`border px-3 py-1 ${p === result.page ? "border-black bg-black text-white" : "border-neutral-300"}`}
              >
                {p}
              </Link>
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}
