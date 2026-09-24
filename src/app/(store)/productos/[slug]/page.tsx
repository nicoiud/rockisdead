import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/catalog";
import { AddToCart } from "./add-to-cart";
import { Gallery } from "./gallery";

export async function generateMetadata(props: PageProps<"/productos/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description?.slice(0, 160),
    openGraph: { images: product.images[0] ? [product.images[0].url] : [] },
  };
}

export default async function ProductPage(props: PageProps<"/productos/[slug]">) {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <Gallery images={product.images} name={product.name} />
      <div className="space-y-6">
        <div>
          {product.category && (
            <Link href={`/productos?categoria=${product.category.slug}`} className="text-xs uppercase text-neutral-500 hover:underline">
              {product.category.name}
            </Link>
          )}
          <h1 className="text-3xl font-black uppercase tracking-tight">{product.name}</h1>
        </div>
        <AddToCart
          productPrice={Number(product.price)}
          productCompareAt={product.compare_at_price ? Number(product.compare_at_price) : null}
          options={product.options}
          variants={product.variants.map((v) => ({
            id: v.id,
            options: v.options,
            price: v.price === null ? null : Number(v.price),
            compare_at_price: v.compare_at_price === null ? null : Number(v.compare_at_price),
            stock: v.stock,
            image_id: v.image_id,
          }))}
        />
        {product.description && (
          <div className="whitespace-pre-line border-t border-neutral-200 pt-6 text-sm leading-relaxed text-neutral-700">
            {product.description}
          </div>
        )}
      </div>
    </div>
  );
}
