"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { PRODUCT_STATUS_LABEL } from "@/lib/labels";
import type { ProductOverview } from "@/lib/types";
import { Badge, EmptyState } from "@/components/ui";
import { BulkActionsBar } from "./bulk-actions";

export function ProductTable({
  products,
  total,
  filterQuery,
  categories,
  lowThreshold,
}: {
  products: ProductOverview[];
  total: number;
  filterQuery: string;
  categories: { id: string; name: string }[];
  lowThreshold: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const allOnPage = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggle = (id: string) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setAllMatching(false);
    setSelected(allOnPage ? new Set() : new Set(products.map((p) => p.id)));
  };

  if (!products.length) return <EmptyState>No hay productos con esos filtros.</EmptyState>;

  const count = allMatching ? total : selected.size;

  return (
    <div className="space-y-3">
      {count > 0 && (
        <BulkActionsBar
          count={count}
          target={allMatching ? { filter: filterQuery } : { ids: [...selected] }}
          categories={categories}
          onDone={() => {
            setSelected(new Set());
            setAllMatching(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {allOnPage && !allMatching && total > products.length && (
        <p className="bg-blue-50 px-3 py-2 text-sm">
          Seleccionaste los {products.length} de esta página.{" "}
          <button type="button" className="font-bold underline" onClick={() => setAllMatching(true)}>
            Seleccionar los {total} productos que coinciden con el filtro
          </button>
        </p>
      )}
      {allMatching && (
        <p className="bg-blue-50 px-3 py-2 text-sm">
          Están seleccionados los <strong>{total}</strong> productos del filtro.{" "}
          <button type="button" className="underline" onClick={() => { setAllMatching(false); setSelected(new Set()); }}>
            Deshacer
          </button>
        </p>
      )}
      <div className="overflow-x-auto border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase">
            <tr>
              <th className="w-8 p-2"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-black" aria-label="Seleccionar todos" /></th>
              <th className="p-2">Producto</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Estado</th>
              <th className="p-2 text-right">Precio</th>
              <th className="p-2 text-right">Variantes</th>
              <th className="p-2 text-right">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {products.map((p) => (
              <tr key={p.id} className={selected.has(p.id) || allMatching ? "bg-blue-50/50" : ""}>
                <td className="p-2"><input type="checkbox" checked={allMatching || selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-black" /></td>
                <td className="p-2">
                  <Link href={`/admin/productos/${p.id}`} className="flex items-center gap-3">
                    <span className="h-12 w-10 shrink-0 bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span>
                      <span className="block font-semibold hover:underline">{p.name}</span>
                      <span className="text-xs text-neutral-500">{p.slug}{p.featured && " · ★ Destacado"}</span>
                    </span>
                  </Link>
                </td>
                <td className="p-2">{p.category_name ?? <span className="text-neutral-400">—</span>}</td>
                <td className="p-2">
                  <Badge tone={p.status === "active" ? "green" : p.status === "draft" ? "yellow" : "neutral"}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(p.min_price)}
                  {Number(p.max_price) !== Number(p.min_price) && ` – ${formatMoney(p.max_price)}`}
                </td>
                <td className="p-2 text-right">{p.variant_count}</td>
                <td className={`p-2 text-right font-semibold tabular-nums ${p.total_stock <= 0 ? "text-red-600" : p.min_stock <= lowThreshold ? "text-yellow-700" : ""}`}>
                  {p.total_stock}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">{total} producto(s)</p>
    </div>
  );
}
