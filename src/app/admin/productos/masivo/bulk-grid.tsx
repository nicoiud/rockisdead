"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveGridAction } from "../actions";
import { PRODUCT_STATUS_LABEL } from "@/lib/labels";
import type { ProductStatus } from "@/lib/types";
import { Alert, Button, Input, Select, cx } from "@/components/ui";

export interface GridVariant {
  id: string;
  title: string;
  sku: string;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  active: boolean;
}
export interface GridProduct {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  price: number;
  compare_at_price: number | null;
  status: ProductStatus;
  featured: boolean;
  tags: string;
  variants: GridVariant[];
}

type Mode = "both" | "products" | "variants";
type ProductField = "name" | "category_id" | "price" | "compare_at_price" | "status" | "featured" | "tags";
type VariantField = "sku" | "price" | "compare_at_price" | "stock" | "active";

type PEdits = Record<string, Partial<Record<ProductField, unknown>>>;
type VEdits = Record<string, Partial<Record<VariantField, unknown>>>;

const P_FIELDS: { key: ProductField; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "category_id", label: "Categoría" },
  { key: "price", label: "Precio" },
  { key: "compare_at_price", label: "Precio tachado" },
  { key: "status", label: "Estado" },
  { key: "featured", label: "Destacado" },
  { key: "tags", label: "Etiquetas" },
];
const V_FIELDS: { key: VariantField; label: string }[] = [
  { key: "sku", label: "SKU" },
  { key: "price", label: "Precio variante" },
  { key: "compare_at_price", label: "Tachado variante" },
  { key: "stock", label: "Stock" },
  { key: "active", label: "Variante activa" },
];

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function BulkGrid({ products, categories }: { products: GridProduct[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("both");
  const [search, setSearch] = useState("");
  const [pEdits, setPEdits] = useState<PEdits>({});
  const [vEdits, setVEdits] = useState<VEdits>({});
  const [selP, setSelP] = useState<Set<string>>(new Set());
  const [selV, setSelV] = useState<Set<string>>(new Set());
  const [applyField, setApplyField] = useState<string>("p:status");
  const [applyValue, setApplyValue] = useState<string>("active");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || p.slug.includes(term) || p.variants.some((v) => v.sku.toLowerCase().includes(term) || v.title.toLowerCase().includes(term)),
    );
  }, [products, search]);

  const pVal = <K extends ProductField>(p: GridProduct, k: K) => (k in (pEdits[p.id] ?? {}) ? pEdits[p.id][k] : p[k]);
  const vVal = <K extends VariantField>(v: GridVariant, k: K) => (k in (vEdits[v.id] ?? {}) ? vEdits[v.id][k] : v[k]);

  function editP(p: GridProduct, k: ProductField, value: unknown) {
    setPEdits((e) => {
      const cur = { ...(e[p.id] ?? {}) };
      if (value === p[k]) delete cur[k];
      else cur[k] = value;
      const next = { ...e, [p.id]: cur };
      if (!Object.keys(cur).length) delete next[p.id];
      return next;
    });
  }
  function editV(v: GridVariant, k: VariantField, value: unknown) {
    setVEdits((e) => {
      const cur = { ...(e[v.id] ?? {}) };
      if (value === v[k]) delete cur[k];
      else cur[k] = value;
      const next = { ...e, [v.id]: cur };
      if (!Object.keys(cur).length) delete next[v.id];
      return next;
    });
  }

  const changeCount =
    Object.values(pEdits).reduce((n, e) => n + Object.keys(e).length, 0) + Object.values(vEdits).reduce((n, e) => n + Object.keys(e).length, 0);

  // ---- Selección ----
  const showP = mode !== "variants";
  const showV = mode !== "products";
  const allVisibleP = visible.map((p) => p.id);
  const allVisibleV = visible.flatMap((p) => p.variants.map((v) => v.id));
  function toggleSet(set: Set<string>, id: string) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }
  function selectProductRow(p: GridProduct) {
    // En modo "ambos", seleccionar un producto también selecciona sus variantes
    const on = !selP.has(p.id);
    setSelP((s) => toggleSet(s, p.id));
    if (mode === "both") {
      setSelV((s) => {
        const n = new Set(s);
        for (const v of p.variants) {
          if (on) n.add(v.id);
          else n.delete(v.id);
        }
        return n;
      });
    }
  }
  function selectAll(on: boolean) {
    setSelP(on && showP ? new Set(allVisibleP) : new Set());
    setSelV(on && showV ? new Set(allVisibleV) : new Set());
  }

  // ---- Aplicar a seleccionados ----
  const [scope, field] = applyField.split(":") as ["p" | "v", string];
  function parseApply(): { ok: true; value: unknown } | { ok: false; error: string } {
    const f = field;
    if (f === "featured" || f === "active") return { ok: true, value: applyValue === "true" };
    if (f === "status" || f === "category_id") return { ok: true, value: applyValue || null };
    if (f === "name" || f === "sku" || f === "tags") return { ok: true, value: applyValue };
    if (f === "stock") {
      const n = Number(applyValue);
      return Number.isInteger(n) ? { ok: true, value: n } : { ok: false, error: "Stock debe ser entero" };
    }
    const n = numOrNull(applyValue);
    if (n !== null && (Number.isNaN(n) || n < 0)) return { ok: false, error: "Número inválido" };
    if (n === null && f === "price" && scope === "p") return { ok: false, error: "El precio del producto no puede quedar vacío" };
    return { ok: true, value: n };
  }
  function applyToSelected(stockMode: "set" | "add" = "set") {
    const parsed = parseApply();
    if (!parsed.ok) {
      setMessage({ tone: "error", text: parsed.error });
      return;
    }
    let affected = 0;
    if (scope === "p") {
      for (const p of products) if (selP.has(p.id)) { editP(p, field as ProductField, parsed.value); affected++; }
    } else {
      for (const p of products)
        for (const v of p.variants)
          if (selV.has(v.id)) {
            const value = field === "stock" && stockMode === "add" ? Number(vVal(v, "stock")) + (parsed.value as number) : parsed.value;
            editV(v, field as VariantField, value);
            affected++;
          }
    }
    setMessage({ tone: affected ? "success" : "error", text: affected ? `Aplicado a ${affected} fila(s). Falta guardar.` : "No hay filas seleccionadas de ese tipo" });
  }

  function save() {
    setMessage(null);
    for (const [id, e] of Object.entries(pEdits)) {
      if ("price" in e && (e.price === null || Number.isNaN(e.price))) return setMessage({ tone: "error", text: "Hay precios de producto inválidos" });
      if ("name" in e && !String(e.name).trim()) return setMessage({ tone: "error", text: `Nombre vacío (${id.slice(0, 8)})` });
    }
    for (const e of Object.values(vEdits)) {
      if ("stock" in e && !Number.isInteger(e.stock)) return setMessage({ tone: "error", text: "Hay stocks inválidos" });
      if (("price" in e && Number.isNaN(e.price)) || ("compare_at_price" in e && Number.isNaN(e.compare_at_price))) {
        return setMessage({ tone: "error", text: "Hay precios de variante inválidos" });
      }
    }
    startTransition(async () => {
      const res = await saveGridAction({
        products: Object.entries(pEdits).map(([id, patch]) => ({
          id,
          patch: {
            ...patch,
            ...("tags" in patch ? { tags: String(patch.tags).split(",").map((t) => t.trim()).filter(Boolean) } : {}),
          } as never,
        })),
        variants: Object.entries(vEdits).map(([id, patch]) => ({ id, patch: patch as never })),
      });
      if (res.ok) {
        setPEdits({});
        setVEdits({});
        setMessage({ tone: "success", text: `Se guardaron ${changeCount} cambio(s).` });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: res.error });
      }
    });
  }

  const cell = (dirty: boolean) => cx("p-0.5", dirty && "bg-yellow-100");
  const inputCls = "w-full border border-transparent bg-transparent px-1 py-1 text-sm hover:border-neutral-300 focus:border-black focus:bg-white focus:outline-none";
  const isDirtyP = (p: GridProduct, k: ProductField) => k in (pEdits[p.id] ?? {});
  const isDirtyV = (v: GridVariant, k: VariantField) => k in (vEdits[v.id] ?? {});
  const selectedCount = (showP ? selP.size : 0) + (showV ? selV.size : 0);

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap items-end gap-3 border border-neutral-200 bg-white p-3">
        <div className="flex border border-black text-xs font-semibold uppercase">
          {(["both", "products", "variants"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cx("px-3 py-2", mode === m ? "bg-black text-white" : "bg-white")}>
              {m === "both" ? "Productos + variantes" : m === "products" ? "Solo productos" : "Solo variantes"}
            </button>
          ))}
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en la grilla (nombre, SKU, variante)" className="w-72" />
        <span className="text-xs text-neutral-500">{visible.length} productos · {allVisibleV.length} variantes</span>
      </div>

      <div className="flex flex-wrap items-end gap-2 border border-neutral-200 bg-white p-3">
        <span className="text-sm font-bold">{selectedCount} seleccionada(s)</span>
        <Select
          value={applyField}
          onChange={(e) => {
            setApplyField(e.target.value);
            const f = e.target.value.split(":")[1];
            setApplyValue(f === "status" ? "active" : f === "featured" || f === "active" ? "true" : "");
          }}
          className="w-52"
        >
          <optgroup label="Productos">
            {P_FIELDS.map((f) => <option key={f.key} value={`p:${f.key}`}>{f.label}</option>)}
          </optgroup>
          <optgroup label="Variantes">
            {V_FIELDS.map((f) => <option key={f.key} value={`v:${f.key}`}>{f.label}</option>)}
          </optgroup>
        </Select>
        {field === "status" ? (
          <Select value={applyValue} onChange={(e) => setApplyValue(e.target.value)} className="w-40">
            {Object.entries(PRODUCT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        ) : field === "category_id" ? (
          <Select value={applyValue} onChange={(e) => setApplyValue(e.target.value)} className="w-44">
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        ) : field === "featured" || field === "active" ? (
          <Select value={applyValue} onChange={(e) => setApplyValue(e.target.value)} className="w-28">
            <option value="true">Sí</option>
            <option value="false">No</option>
          </Select>
        ) : (
          <Input value={applyValue} onChange={(e) => setApplyValue(e.target.value)} placeholder="Valor (vacío = sin valor)" className="w-44" />
        )}
        <Button type="button" variant="secondary" onClick={() => applyToSelected("set")}>Aplicar a seleccionadas</Button>
        {field === "stock" && (
          <Button type="button" variant="secondary" onClick={() => applyToSelected("add")}>Sumar a seleccionadas</Button>
        )}
        <button type="button" className="text-xs underline" onClick={() => selectAll(true)}>Seleccionar todo lo visible</button>
        <button type="button" className="text-xs underline" onClick={() => selectAll(false)}>Limpiar selección</button>
      </div>

      <div className="max-h-[70vh] overflow-auto border border-neutral-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-100 text-left text-xs uppercase">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2">{mode === "variants" ? "Producto / Variante" : "Nombre"}</th>
              {showP && <th className="p-2">Categoría</th>}
              {showP && <th className="p-2">Estado</th>}
              {showP && <th className="p-2">Dest.</th>}
              {showV && <th className="p-2">SKU</th>}
              <th className="p-2">Precio</th>
              <th className="p-2">Tachado</th>
              {showV && <th className="p-2">Stock</th>}
              {showV && <th className="p-2">Activa</th>}
              {showP && <th className="p-2">Etiquetas</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <ProductRows key={p.id}>
                {showP && (
                  <tr className={cx("border-t border-neutral-200", mode === "both" && "bg-neutral-50 font-semibold", selP.has(p.id) && "bg-blue-50")}>
                    <td className="p-2"><input type="checkbox" checked={selP.has(p.id)} onChange={() => selectProductRow(p)} className="accent-black" /></td>
                    <td className={cell(isDirtyP(p, "name"))}>
                      <div className="flex items-center gap-1">
                        <input className={inputCls} value={String(pVal(p, "name"))} onChange={(e) => editP(p, "name", e.target.value)} />
                        <Link href={`/admin/productos/${p.id}`} className="text-xs text-neutral-400" title="Abrir producto">↗</Link>
                      </div>
                    </td>
                    <td className={cell(isDirtyP(p, "category_id"))}>
                      <select className={inputCls} value={String(pVal(p, "category_id") ?? "")} onChange={(e) => editP(p, "category_id", e.target.value || null)}>
                        <option value="">—</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className={cell(isDirtyP(p, "status"))}>
                      <select className={inputCls} value={String(pVal(p, "status"))} onChange={(e) => editP(p, "status", e.target.value)}>
                        {Object.entries(PRODUCT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td className={cx(cell(isDirtyP(p, "featured")), "text-center")}>
                      <input type="checkbox" checked={Boolean(pVal(p, "featured"))} onChange={(e) => editP(p, "featured", e.target.checked)} className="accent-black" />
                    </td>
                    {showV && <td />}
                    <td className={cell(isDirtyP(p, "price"))}>
                      <NumberCell className={inputCls} value={pVal(p, "price") as number | null} onChange={(n) => editP(p, "price", n)} />
                    </td>
                    <td className={cell(isDirtyP(p, "compare_at_price"))}>
                      <NumberCell className={inputCls} value={pVal(p, "compare_at_price") as number | null} onChange={(n) => editP(p, "compare_at_price", n)} />
                    </td>
                    {showV && <td className="p-2 text-xs text-neutral-500">{p.variants.reduce((n, v) => n + Number(vVal(v, "stock")), 0)}</td>}
                    {showV && <td />}
                    <td className={cell(isDirtyP(p, "tags"))}>
                      <input className={inputCls} value={String(pVal(p, "tags"))} onChange={(e) => editP(p, "tags", e.target.value)} />
                    </td>
                  </tr>
                )}
                {showV &&
                  p.variants.map((v) => (
                    <tr key={v.id} className={cx("border-t border-neutral-100", selV.has(v.id) && "bg-blue-50")}>
                      <td className="p-2"><input type="checkbox" checked={selV.has(v.id)} onChange={() => setSelV((s) => toggleSet(s, v.id))} className="accent-black" /></td>
                      <td className={cx("p-2", mode === "both" && "pl-6")}>
                        {mode === "variants" && <span className="font-semibold">{p.name} </span>}
                        <span className="text-neutral-600">{v.title || "Única"}</span>
                      </td>
                      {showP && <td />}
                      {showP && <td />}
                      {showP && <td />}
                      <td className={cell(isDirtyV(v, "sku"))}>
                        <input className={inputCls} value={String(vVal(v, "sku"))} onChange={(e) => editV(v, "sku", e.target.value)} />
                      </td>
                      <td className={cell(isDirtyV(v, "price"))}>
                        <NumberCell className={inputCls} value={vVal(v, "price") as number | null} placeholder={String(pVal(p, "price"))} onChange={(n) => editV(v, "price", n)} />
                      </td>
                      <td className={cell(isDirtyV(v, "compare_at_price"))}>
                        <NumberCell className={inputCls} value={vVal(v, "compare_at_price") as number | null} onChange={(n) => editV(v, "compare_at_price", n)} />
                      </td>
                      <td className={cell(isDirtyV(v, "stock"))}>
                        <NumberCell className={inputCls} integer value={vVal(v, "stock") as number} onChange={(n) => editV(v, "stock", n ?? 0)} />
                      </td>
                      <td className={cx(cell(isDirtyV(v, "active")), "text-center")}>
                        <input type="checkbox" checked={Boolean(vVal(v, "active"))} onChange={(e) => editV(v, "active", e.target.checked)} className="accent-black" />
                      </td>
                      {showP && <td />}
                    </tr>
                  ))}
              </ProductRows>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 md:left-56">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex-1">
            {message ? <Alert tone={message.tone}>{message.text}</Alert> : <span className="text-sm text-neutral-500">{changeCount} cambio(s) sin guardar</span>}
          </div>
          <Button type="button" variant="secondary" disabled={!changeCount || pending} onClick={() => { setPEdits({}); setVEdits({}); setMessage(null); }}>
            Descartar
          </Button>
          <Button type="button" disabled={!changeCount || pending} onClick={save}>
            {pending ? "Guardando…" : `Guardar ${changeCount || ""} cambio(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Celda numérica que permite escribir libremente y confirma al salir. */
function NumberCell({
  value,
  onChange,
  className,
  placeholder,
  integer,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  className: string;
  placeholder?: string;
  integer?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || value === undefined ? "" : String(value));
  return (
    <input
      className={cx(className, "text-right tabular-nums")}
      inputMode="decimal"
      value={shown}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const n = numOrNull(draft);
        if (n !== null && (Number.isNaN(n) || (integer && !Number.isInteger(n)))) {
          setDraft(null);
          return;
        }
        onChange(n);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
