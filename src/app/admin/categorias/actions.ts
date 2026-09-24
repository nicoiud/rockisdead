"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/format";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Nombre muy corto").max(80),
  slug: z.string().trim().optional(),
  description: z.string().trim().max(1000).optional(),
  sort_order: z.coerce.number().int().default(0),
  active: z.string().optional(),
});

export async function saveCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertStaff("products");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const row = {
    name: d.name,
    slug: slugify(d.slug || d.name),
    description: d.description || null,
    sort_order: d.sort_order,
    active: d.active === "1",
  };
  const db = createAdminClient();
  const { error } = d.id ? await db.from("categories").update(row).eq("id", d.id) : await db.from("categories").insert(row);
  if (error) return { error: error.code === "23505" ? "Ya existe una categoría con esa URL" : error.message };
  revalidatePath("/admin/categorias");
  revalidatePath("/", "layout");
  return { ok: true, message: "Categoría guardada" };
}

export async function deleteCategory(formData: FormData) {
  await assertStaff("products");
  await createAdminClient().from("categories").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/categorias");
  revalidatePath("/", "layout");
}
