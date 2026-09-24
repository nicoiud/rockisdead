import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTitle } from "@/components/ui";
import { ProductEditor } from "../product-editor";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  await requireStaff("products");
  const { data: cats } = await createAdminClient().from("categories").select("id, name").order("sort_order").order("name");
  return (
    <div>
      <PageTitle>Nuevo producto</PageTitle>
      <ProductEditor
        categories={cats ?? []}
        initial={{
          name: "", slug: "", description: "", category_id: "", price: "", compare_at_price: "",
          status: "draft", featured: false, tags: "", options: [], images: [],
          variants: [{ options: {}, sku: "", price: "", compare_at_price: "", stock: "0", active: true, image_url: "" }],
        }}
      />
    </div>
  );
}
