import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Category } from "@/lib/types";
import { Card, PageTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { CategoryForm } from "./category-form";
import { deleteCategory } from "./actions";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  await requireStaff("products");
  const db = createAdminClient();
  const [{ data }, { data: counts }] = await Promise.all([
    db.from("categories").select("*").order("sort_order").order("name"),
    db.from("products").select("category_id"),
  ]);
  const categories = (data ?? []) as Category[];
  const countBy = new Map<string, number>();
  for (const r of counts ?? []) if (r.category_id) countBy.set(r.category_id, (countBy.get(r.category_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <PageTitle>Categorías</PageTitle>
      <Card title="Nueva categoría"><CategoryForm /></Card>
      <Card title={`Categorías (${categories.length})`}>
        <ul className="divide-y divide-neutral-200">
          {categories.map((c) => (
            <li key={c.id} className="space-y-2 py-4">
              <div className="flex items-center justify-between text-sm">
                <Link href={`/admin/productos?categoria=${c.id}`} className="underline">{countBy.get(c.id) ?? 0} producto(s)</Link>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton variant="ghost" className="text-red-600" message={`¿Eliminar "${c.name}"? Los productos quedan sin categoría.`}>
                    Eliminar
                  </ConfirmButton>
                </form>
              </div>
              <CategoryForm category={c} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
