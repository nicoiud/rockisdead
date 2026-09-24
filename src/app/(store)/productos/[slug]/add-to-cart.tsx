"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { addToCart } from "../../carrito/actions";
import { formatMoney } from "@/lib/format";
import type { ProductOption } from "@/lib/types";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/form";

interface VariantInfo {
  id: string;
  options: Record<string, string>;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  image_id: string | null;
}

export function AddToCart({
  options,
  variants,
  productPrice,
  productCompareAt,
}: {
  options: ProductOption[];
  variants: VariantInfo[];
  productPrice: number;
  productCompareAt: number | null;
}) {
  // Preselecciona la primera variante con stock
  const initial = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(initial?.options ?? {});
  const [qty, setQty] = useState(1);
  const [state, action] = useActionState(addToCart, null);

  const variant = useMemo(
    () => variants.find((v) => options.every((o) => v.options[o.name] === selected[o.name])),
    [variants, options, selected],
  );

  // ¿Hay stock para este valor dado lo ya elegido en las otras opciones?
  const valueAvailable = (optName: string, value: string) =>
    variants.some(
      (v) =>
        v.options[optName] === value &&
        v.stock > 0 &&
        options.every((o) => o.name === optName || !selected[o.name] || v.options[o.name] === selected[o.name]),
    );

  const price = variant?.price ?? productPrice;
  const compareAt = variant?.compare_at_price ?? productCompareAt;
  const stock = variant?.stock ?? 0;

  if (!variants.length) return <Alert tone="warning">Producto sin variantes disponibles.</Alert>;

  return (
    <form action={action} className="space-y-5">
      <p className="text-2xl font-bold">
        {formatMoney(price)}
        {compareAt && compareAt > price && <span className="ml-3 text-lg text-neutral-400 line-through">{formatMoney(compareAt)}</span>}
      </p>

      {options.map((opt) => (
        <div key={opt.name}>
          <p className="mb-2 text-xs font-bold uppercase">
            {opt.name}: <span className="font-normal">{selected[opt.name] ?? "—"}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((value) => {
              const available = valueAvailable(opt.name, value);
              const isSelected = selected[opt.name] === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelected((s) => ({ ...s, [opt.name]: value }))}
                  className={`min-w-12 border px-3 py-2 text-sm uppercase ${
                    isSelected ? "border-black bg-black text-white" : "border-neutral-300 hover:border-black"
                  } ${available ? "" : "text-neutral-400 line-through"}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <input type="hidden" name="variant_id" value={variant?.id ?? ""} />

      <div className="flex items-center gap-3">
        <label className="text-xs font-bold uppercase">Cantidad</label>
        <input
          type="number"
          name="quantity"
          min={1}
          max={Math.max(1, stock)}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="w-20 border border-neutral-300 px-2 py-2 text-sm"
        />
        <span className="text-sm text-neutral-500">
          {!variant ? "Combinación no disponible" : stock > 0 ? (stock <= 5 ? `¡Últimas ${stock} unidades!` : "En stock") : "Sin stock"}
        </span>
      </div>

      <SubmitButton className="w-full py-3" disabled={!variant || stock <= 0} pendingText="Agregando…">
        {variant && stock > 0 ? "Agregar al carrito" : "Sin stock"}
      </SubmitButton>

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.ok && (
        <Alert tone="success">
          Agregado al carrito. <Link href="/carrito" className="font-bold underline">Ver carrito</Link>
        </Alert>
      )}
    </form>
  );
}
