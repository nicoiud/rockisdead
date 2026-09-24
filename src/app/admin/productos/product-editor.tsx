"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/format";
import { combinations, normalizeOptions, optionsKey, variantTitle } from "@/lib/variants";
import type { ProductOption, ProductStatus } from "@/lib/types";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { deleteProductAction, saveProductAction } from "./actions";

export interface EditorImage { id?: string; url: string; path?: string | null; alt?: string | null }
export interface EditorVariant {
  id?: string;
  options: Record<string, string>;
  sku: string;
  price: string;
  compare_at_price: string;
  stock: string;
  active: boolean;
  image_url: string;
}
export interface EditorProduct {
  id?: string;
  name: string;
  slug: string;
  description: string;
  category_id: string;
  price: string;
  compare_at_price: string;
  status: ProductStatus;
  featured: boolean;
  tags: string;
  options: ProductOption[];
  images: EditorImage[];
  variants: EditorVariant[];
}

const emptyVariant = (options: Record<string, string>): EditorVariant => ({
  options, sku: "", price: "", compare_at_price: "", stock: "0", active: true, image_url: "",
});

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function ProductEditor({ initial, categories }: { initial: EditorProduct; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [p, setP] = useState<EditorProduct>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [optionDrafts, setOptionDrafts] = useState(initial.options.map((o) => ({ name: o.name, values: o.values.join(", ") })));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [bulk, setBulk] = useState({ price: "", stock: "", skuPrefix: "" });

  const set = <K extends keyof EditorProduct>(k: K, v: EditorProduct[K]) => setP((s) => ({ ...s, [k]: v }));
  const parsedOptions = useMemo(
    () => normalizeOptions(optionDrafts.map((o) => ({ name: o.name, values: o.values.split(",") }))),
    [optionDrafts],
  );
  const optionsDirty = JSON.stringify(parsedOptions) !== JSON.stringify(p.options);

  // ---- Opciones y variantes ----
  function generateVariants() {
    const combos = combinations(parsedOptions);
    const current = new Map(p.variants.map((v) => [optionsKey(v.options), v]));
    const next = combos.map((c) => current.get(optionsKey(c)) ?? emptyVariant(c));
    const removed = p.variants.filter((v) => !combos.some((c) => optionsKey(c) === optionsKey(v.options)));
    if (removed.some((v) => v.id) && !confirm(`Se eliminarán ${removed.filter((v) => v.id).length} variante(s) existentes. ¿Continuar?`)) return;
    setP((s) => ({ ...s, options: parsedOptions, variants: next }));
  }

  function updateVariant(i: number, patch: Partial<EditorVariant>) {
    setP((s) => ({ ...s, variants: s.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  }

  function applyToAllVariants() {
    setP((s) => ({
      ...s,
      variants: s.variants.map((v) => ({
        ...v,
        ...(bulk.price !== "" ? { price: bulk.price } : {}),
        ...(bulk.stock !== "" ? { stock: bulk.stock } : {}),
        ...(bulk.skuPrefix !== ""
          ? { sku: [bulk.skuPrefix, ...s.options.map((o) => slugify(v.options[o.name] ?? "").toUpperCase())].filter(Boolean).join("-") }
          : {}),
      })),
    }));
  }

  // ---- Imágenes ----
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage(null);
    const supabase = createClient();
    const uploaded: EditorImage[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ tone: "error", text: `${file.name} supera 5 MB` });
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${slugify(p.name) || "producto"}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("products").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (error) {
        setMessage({ tone: "error", text: `No se pudo subir ${file.name}: ${error.message}` });
        continue;
      }
      const { data } = supabase.storage.from("products").getPublicUrl(path);
      uploaded.push({ url: data.publicUrl, path, alt: p.name });
    }
    setP((s) => ({ ...s, images: [...s.images, ...uploaded] }));
    setUploading(false);
  }

  function moveImage(i: number, dir: -1 | 1) {
    setP((s) => {
      const imgs = [...s.images];
      const j = i + dir;
      if (j < 0 || j >= imgs.length) return s;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      return { ...s, images: imgs };
    });
  }

  // ---- Guardar ----
  function save() {
    setMessage(null);
    if (optionsDirty) {
      setMessage({ tone: "error", text: "Cambiaste las opciones: tocá “Generar variantes” antes de guardar." });
      return;
    }
    const price = toNum(p.price);
    if (price === null || Number.isNaN(price)) {
      setMessage({ tone: "error", text: "Ingresá un precio válido" });
      return;
    }
    const variants = p.variants.map((v) => ({
      id: v.id,
      options: v.options,
      sku: v.sku.trim() || null,
      price: toNum(v.price),
      compare_at_price: toNum(v.compare_at_price),
      stock: Number(v.stock || 0),
      active: v.active,
      image_url: v.image_url || null,
    }));
    if (variants.some((v) => Number.isNaN(v.price) || Number.isNaN(v.compare_at_price) || !Number.isInteger(v.stock))) {
      setMessage({ tone: "error", text: "Revisá precios y stock de las variantes (stock debe ser entero)" });
      return;
    }
    startTransition(async () => {
      const res = await saveProductAction({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        category_id: p.category_id || null,
        price,
        compare_at_price: toNum(p.compare_at_price),
        status: p.status,
        featured: p.featured,
        tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean),
        options: p.options,
        images: p.images,
        variants,
      });
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      setMessage({ tone: "success", text: "Producto guardado" });
      if (!p.id) router.replace(`/admin/productos/${res.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!p.id || !confirm("¿Eliminar este producto? No se puede deshacer.")) return;
    startTransition(async () => {
      const res = await deleteProductAction(p.id!);
      if (res.ok) router.replace("/admin/productos");
      else setMessage({ tone: "error", text: res.error });
    });
  }

  const totalStock = p.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0);

  return (
    <div className="space-y-6 pb-24">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Datos">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" className="sm:col-span-2">
                <Input
                  value={p.name}
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (!slugTouched) set("slug", slugify(e.target.value));
                  }}
                  required
                />
              </Field>
              <Field label="URL (slug)" hint={`/productos/${p.slug || "…"}`} className="sm:col-span-2">
                <Input value={p.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} />
              </Field>
              <Field label="Descripción" className="sm:col-span-2">
                <Textarea rows={5} value={p.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
              <Field label="Precio" hint="Precio base. Cada variante puede tener su propio precio.">
                <Input type="number" min={0} step="any" value={p.price} onChange={(e) => set("price", e.target.value)} />
              </Field>
              <Field label="Precio anterior (tachado)">
                <Input type="number" min={0} step="any" value={p.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title={`Imágenes (${p.images.length})`}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {p.images.map((img, i) => (
                <div key={img.url} className="space-y-1">
                  <div className="relative aspect-[3/4] bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt ?? ""} className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 bg-black px-1 text-[10px] uppercase text-white">Principal</span>}
                  </div>
                  <div className="flex justify-between text-xs">
                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30">←</button>
                    <button type="button" onClick={() => set("images", p.images.filter((_, j) => j !== i))} className="text-red-600">Quitar</button>
                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === p.images.length - 1} className="px-1 disabled:opacity-30">→</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer border border-black px-3 py-2 text-xs font-semibold uppercase">
                {uploading ? "Subiendo…" : "Subir imágenes"}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.elements.namedItem("url") as HTMLInputElement;
                  try {
                    new URL(input.value);
                    set("images", [...p.images, { url: input.value, alt: p.name }]);
                    input.value = "";
                  } catch {
                    setMessage({ tone: "error", text: "URL de imagen inválida" });
                  }
                }}
              >
                <Input name="url" placeholder="…o pegá la URL de una imagen" />
                <Button type="submit" variant="secondary">Agregar</Button>
              </form>
            </div>
          </Card>

          <Card title="Opciones de variantes">
            <p className="mb-3 text-xs text-neutral-500">
              Definí las opciones que quieras (Talle, Color, Largo, Calce…) y sus valores separados por coma. Sin opciones, el producto tiene una única variante.
            </p>
            <div className="space-y-2">
              {optionDrafts.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={o.name}
                    placeholder="Nombre (ej. Talle)"
                    className="w-40"
                    onChange={(e) => setOptionDrafts((d) => d.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <Input
                    value={o.values}
                    placeholder="Valores: S, M, L, XL"
                    onChange={(e) => setOptionDrafts((d) => d.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)))}
                  />
                  <Button type="button" variant="ghost" onClick={() => setOptionDrafts((d) => d.filter((_, j) => j !== i))}>✕</Button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setOptionDrafts((d) => [...d, { name: "", values: "" }])}>+ Agregar opción</Button>
              <Button type="button" onClick={generateVariants} disabled={!optionsDirty && p.variants.length > 0}>
                Generar variantes ({combinations(parsedOptions).length})
              </Button>
            </div>
            {optionsDirty && <p className="mt-2 text-xs text-yellow-700">Hay cambios en las opciones sin aplicar.</p>}
          </Card>

          <Card title={`Variantes (${p.variants.length}) · Stock total ${totalStock}`}>
            {p.variants.length > 1 && (
              <div className="mb-3 flex flex-wrap items-end gap-2 bg-neutral-50 p-2 text-xs">
                <span className="font-semibold uppercase">Aplicar a todas:</span>
                <Input className="w-28" placeholder="Precio" type="number" value={bulk.price} onChange={(e) => setBulk({ ...bulk, price: e.target.value })} />
                <Input className="w-24" placeholder="Stock" type="number" value={bulk.stock} onChange={(e) => setBulk({ ...bulk, stock: e.target.value })} />
                <Input className="w-32" placeholder="Prefijo SKU" value={bulk.skuPrefix} onChange={(e) => setBulk({ ...bulk, skuPrefix: e.target.value.toUpperCase() })} />
                <Button type="button" variant="secondary" onClick={applyToAllVariants}>Aplicar</Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="p-1">Variante</th>
                    <th className="p-1">SKU</th>
                    <th className="p-1">Precio</th>
                    <th className="p-1">Tachado</th>
                    <th className="p-1">Stock</th>
                    <th className="p-1">Imagen</th>
                    <th className="p-1">Activa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.variants.map((v, i) => (
                    <tr key={optionsKey(v.options) || i} className="border-t border-neutral-100">
                      <td className="p-1 font-semibold">{variantTitle(p.options, v.options) || "Única"}</td>
                      <td className="p-1"><Input className="w-32" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} /></td>
                      <td className="p-1"><Input className="w-28" type="number" min={0} step="any" placeholder={p.price} value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} /></td>
                      <td className="p-1"><Input className="w-28" type="number" min={0} step="any" value={v.compare_at_price} onChange={(e) => updateVariant(i, { compare_at_price: e.target.value })} /></td>
                      <td className="p-1"><Input className="w-20" type="number" step={1} value={v.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} /></td>
                      <td className="p-1">
                        <Select className="w-28" value={v.image_url} onChange={(e) => updateVariant(i, { image_url: e.target.value })}>
                          <option value="">—</option>
                          {p.images.map((img, j) => <option key={img.url} value={img.url}>Imagen {j + 1}</option>)}
                        </Select>
                      </td>
                      <td className="p-1 text-center"><input type="checkbox" checked={v.active} onChange={(e) => updateVariant(i, { active: e.target.checked })} className="accent-black" /></td>
                      <td className="p-1">
                        {p.options.length > 0 && p.variants.length > 1 && (
                          <button type="button" className="text-xs text-red-600" onClick={() => set("variants", p.variants.filter((_, j) => j !== i))}>Quitar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Precio vacío = usa el precio del producto. Los cambios de stock quedan registrados en el historial de movimientos.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Publicación">
            <div className="space-y-4">
              <Field label="Estado">
                <Select value={p.status} onChange={(e) => set("status", e.target.value as ProductStatus)}>
                  <option value="active">Publicado</option>
                  <option value="draft">Borrador</option>
                  <option value="inactive">Oculto</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={p.featured} onChange={(e) => set("featured", e.target.checked)} className="accent-black" />
                Destacado en la home
              </label>
              <Field label="Categoría">
                <Select value={p.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Etiquetas" hint="Separadas por coma">
                <Input value={p.tags} onChange={(e) => set("tags", e.target.value)} />
              </Field>
            </div>
          </Card>
          {p.id && (
            <Card title="Acciones">
              <div className="space-y-2 text-sm">
                {initial.status === "active" && <Link href={`/productos/${initial.slug}`} target="_blank" className="block underline">Ver en la tienda ↗</Link>}
                <Link href={`/admin/stock?producto=${p.id}`} className="block underline">Historial de stock</Link>
                <Button type="button" variant="danger" onClick={remove} disabled={pending} className="w-full">Eliminar producto</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 md:left-56">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex-1">{message && <Alert tone={message.tone}>{message.text}</Alert>}</div>
          <Link href="/admin/productos" className="text-sm underline">Volver</Link>
          <Button type="button" onClick={save} disabled={pending || uploading}>{pending ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>
    </div>
  );
}
