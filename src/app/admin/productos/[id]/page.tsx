import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Product, ProductImage, ProductVariant } from "@/lib/types";
import { PageTitle } from "@/components/ui";
import { ProductEditor } from "../product-editor";

export const metadata: Metadata = { title: "Editar producto" };

export default async function EditProductPage(props: PageProps<"/admin/productos/[id]">) {
  await requireStaff("products");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: product }, { data: images }, { data: variants }, { data: cats }] = await Promise.all([
    db.from("products").select("*").eq("id", id).maybeSingle<Product>(),
    db.from("product_images").select("*").eq("product_id", id).order("position"),
    db.from("product_variants").select("*").eq("product_id", id).order("position"),
    db.from("categories").select("id, name").order("sort_order").order("name"),
  ]);
  if (!product) notFound();
  const imgs = (images ?? []) as ProductImage[];
  const s = (n: number | null) => (n === null ? "" : String(Number(n)));

  return (
    <div>
      <PageTitle>{product.name}</PageTitle>
      <ProductEditor
        key={product.updated_at}
        categories={cats ?? []}
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description ?? "",
          category_id: product.category_id ?? "",
          price: s(product.price),
          compare_at_price: s(product.compare_at_price),
          status: product.status,
          featured: product.featured,
          tags: product.tags.join(", "),
          options: product.options,
          images: imgs.map((i) => ({ id: i.id, url: i.url, path: i.path, alt: i.alt })),
          variants: ((variants ?? []) as ProductVariant[]).map((v) => ({
            id: v.id,
            options: v.options,
            sku: v.sku ?? "",
            price: s(v.price),
            compare_at_price: s(v.compare_at_price),
            stock: String(v.stock),
            active: v.active,
            image_url: imgs.find((i) => i.id === v.image_id)?.url ?? "",
          })),
        }}
      />
    </div>
  );
}
