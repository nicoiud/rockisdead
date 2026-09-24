import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { ProductOverview } from "@/lib/types";

export function ProductCard({ product }: { product: ProductOverview }) {
  const soldOut = product.total_stock <= 0;
  const priceRange = Number(product.min_price) !== Number(product.max_price);
  return (
    <Link href={`/productos/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase text-neutral-400">Sin imagen</div>
        )}
        {soldOut && <span className="absolute left-2 top-2 bg-black px-2 py-1 text-xs font-bold uppercase text-white">Agotado</span>}
        {!soldOut && product.compare_at_price && Number(product.compare_at_price) > Number(product.min_price) && (
          <span className="absolute left-2 top-2 bg-red-600 px-2 py-1 text-xs font-bold uppercase text-white">Oferta</span>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <h3 className="text-sm font-semibold uppercase">{product.name}</h3>
        <p className="text-sm">
          {priceRange && <span className="text-neutral-500">Desde </span>}
          {formatMoney(product.min_price)}
          {product.compare_at_price && Number(product.compare_at_price) > Number(product.min_price) && (
            <span className="ml-2 text-neutral-400 line-through">{formatMoney(product.compare_at_price)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
