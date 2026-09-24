"use client";

import { useActionState } from "react";
import { saveCategory } from "./actions";
import type { Category } from "@/lib/types";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function CategoryForm({ category }: { category?: Category }) {
  const [state, action] = useActionState(saveCategory, null);
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-6">
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <Field label="Nombre" className="sm:col-span-2"><Input name="name" defaultValue={category?.name} required /></Field>
      <Field label="URL"><Input name="slug" defaultValue={category?.slug} placeholder="auto" /></Field>
      <Field label="Orden"><Input name="sort_order" type="number" defaultValue={category?.sort_order ?? 0} /></Field>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={category?.active ?? true} className="accent-black" /> Visible
      </label>
      <SubmitButton>{category ? "Guardar" : "Agregar"}</SubmitButton>
      <div className="sm:col-span-6"><FormMessage state={state} /></div>
    </form>
  );
}
