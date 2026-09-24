"use client";

import { useActionState } from "react";
import { adjustStockAction } from "./actions";
import { Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function AdjustStockForm({ variants }: { variants: { id: string; label: string; stock: number }[] }) {
  const [state, action] = useActionState(adjustStockAction, null);
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-6">
      <Field label="Variante" className="sm:col-span-2">
        <Select name="variant_id" required defaultValue="">
          <option value="" disabled>Elegí…</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.label} (stock {v.stock})</option>)}
        </Select>
      </Field>
      <Field label="Tipo">
        <Select name="mode" defaultValue="add">
          <option value="add">Sumar / restar</option>
          <option value="set">Fijar en</option>
        </Select>
      </Field>
      <Field label="Cantidad"><Input name="value" type="number" step={1} required /></Field>
      <Field label="Motivo"><Input name="note" placeholder="Ingreso, conteo, falla…" /></Field>
      <SubmitButton>Ajustar</SubmitButton>
      <div className="sm:col-span-6"><FormMessage state={state} /></div>
    </form>
  );
}
