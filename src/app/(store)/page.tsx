import Link from "next/link";
import { getCategories, listProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ProductCard } from "@/components/store/product-card";
import { ButtonLink } from "@/components/ui";

export default async function HomePage() {
  const [settings, categories, featured, latest] = await Promise.all([
    getSettings(),
    getCategories(),
    listProducts({ featured: true, perPage: 8 }),
    listProducts({ sort: "newest", perPage: 8 }),
  ]);
  const banners = (settings.banners ?? []).filter((b) => b.image || b.title);

  return (
    <div className="space-y-12">
      {banners.length > 0 ? (
        <section className="grid gap-4">
          {banners.map((b, i) => (
            <Link
              key={i}
              href={b.link || "/productos"}
              className="relative flex min-h-64 items-end overflow-hidden bg-black p-8 text-white sm:min-h-96"
            >
              {b.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.image} alt={b.title ?? ""} className="absolute inset-0 h-full w-full object-cover opacity-70" />
              )}
              <div className="relative">
                {b.title && <h2 className="text-4xl font-black uppercase tracking-tight sm:text-6xl">{b.title}</h2>}
                {b.subtitle && <p className="mt-2 text-lg">{b.subtitle}</p>}
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="bg-black px-8 py-20 text-white">
          <h1 className="text-5xl font-black uppercase tracking-tight">{settings.store_name}</h1>
          <ButtonLink href="/productos" variant="secondary" className="mt-6">Ver productos</ButtonLink>
        </section>
      )}

      {categories.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-black uppercase">Categorías</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/productos?categoria=${c.slug}`}
                className="border border-black px-4 py-6 text-center text-sm font-bold uppercase hover:bg-black hover:text-white"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.products.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-black uppercase">Destacados</h2>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {featured.products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">Novedades</h2>
          <Link href="/productos?orden=newest" className="text-sm underline">Ver todo</Link>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {latest.products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </div>
  );
}
