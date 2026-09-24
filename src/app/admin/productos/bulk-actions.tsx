"use client";

import { useState, useTransition } from "react";
import { bulkProductsAction, type BulkInput } from "./actions";
import { Alert, Button, Input, Select } from "@/components/ui";

type ActionKey =
  | "publish" | "hide" | "draft" | "category" | "featured_on" | "featured_off" | "price" | "compare_clear"
  | "stock" | "variants_on" | "variants_off" | "tags_add" | "tags_remove" | "delete";

const LABELS: Record<ActionKey, string> = {
  publish: "Publicar",
  hide: "Ocultar (despublicar)",
  draft: "Pasar a borrador",
  category: "Cambiar categoría",
  featured_on: "Marcar como destacados",
  featured_off: "Quitar destacados",
  price: "Ajustar precios",
  compare_clear: "Quitar precio tachado",
  stock: "Ajustar stock (todas las variantes)",
  variants_on: "Activar todas las variantes",
  variants_off: "Desactivar todas las variantes",
  tags_add: "Agregar etiquetas",
  tags_remove: "Quitar etiquetas",
  delete: "Eliminar",
};

export function BulkActionsBar({
  count,
  target,
  categories,
  onDone,
}: {
  count: number;
  target: { ids?: string[]; filter?: string };
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [action, setAction] = useState<ActionKey>("publish");
  const [categoryId, setCategoryId] = useState("");
  const [priceMode, setPriceMode] = useState<"percent" | "amount" | "set">("percent");
  const [priceValue, setPriceValue] = useState("");
  const [priceTarget, setPriceTarget] = useState<"products" | "variants" | "both">("both");
  const [round, setRound] = useState("0");
  const [compareAt, setCompareAt] = useState(false);
  const [stockMode, setStockMode] = useState<"set" | "add">("set");
  const [stockValue, setStockValue] = useState("");
  const [tags, setTags] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function build(): BulkInput | string {
    switch (action) {
      case "publish": return { action: "status", status: "active" };
      case "hide": return { action: "status", status: "inactive" };
      case "draft": return { action: "status", status: "draft" };
      case "category": return { action: "category", category_id: categoryId || null };
      case "featured_on": return { action: "featured", featured: true };
      case "featured_off": return { action: "featured", featured: false };
      case "compare_clear": return { action: "compare_at_clear" };
      case "variants_on": return { action: "variants_active", active: true };
      case "variants_off": return { action: "variants_active", active: false };
      case "delete": return { action: "delete" };
      case "price": {
        const v = Number(priceValue);
        if (priceValue === "" || !Number.isFinite(v)) return "Ingresá un valor";
        return { action: "price", mode: priceMode, value: v, target: priceTarget, round: Number(round) || 0, compare_at: compareAt };
      }
      case "stock": {
        const v = Number(stockValue);
        if (stockValue === "" || !Number.isInteger(v)) return "Ingresá un número entero";
        return { action: "stock", mode: stockMode, value: v };
      }
      case "tags_add":
      case "tags_remove": {
        const list = tags.split(",").map((t) => t.trim()).filter(Boolean);
        if (!list.length) return "Ingresá al menos una etiqueta";
        return { action, tags: list };
      }
    }
  }

  function run() {
    const input = build();
    if (typeof input === "string") {
      setMessage({ tone: "error", text: input });
      return;
    }
    const verb = LABELS[action].toLowerCase();
    if (!confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} en ${count} producto(s)?${action === "delete" ? " Esta acción no se puede deshacer." : ""}`)) return;
    startTransition(async () => {
      const res = await bulkProductsAction(target, input);
      if (res.ok) {
        setMessage({ tone: "success", text: `Listo: ${res.count} producto(s) actualizados.` });
        onDone();
      } else {
        setMessage({ tone: "error", text: res.error });
      }
    });
  }

  return (
    <div className="space-y-2 border border-black bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-sm font-bold">{count} seleccionado(s)</span>
        <Select value={action} onChange={(e) => setAction(e.target.value as ActionKey)} className="w-60">
          {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>

        {action === "category" && (
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48">
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}

        {action === "price" && (
          <>
            <Select value={priceMode} onChange={(e) => setPriceMode(e.target.value as typeof priceMode)} className="w-40">
              <option value="percent">Porcentaje (%)</option>
              <option value="amount">Sumar/restar $</option>
              <option value="set">Fijar precio $</option>
            </Select>
            <Input type="number" step="any" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} placeholder={priceMode === "percent" ? "ej. 10 o -15" : "monto"} className="w-28" />
            <Select value={priceTarget} onChange={(e) => setPriceTarget(e.target.value as typeof priceTarget)} className="w-56">
              <option value="both">Producto y variantes con precio propio</option>
              <option value="products">Solo precio del producto</option>
              <option value="variants">Solo variantes con precio propio</option>
            </Select>
            <Select value={round} onChange={(e) => setRound(e.target.value)} className="w-40">
              <option value="0">Sin redondeo</option>
              <option value="10">Redondear a $10</option>
              <option value="100">Redondear a $100</option>
              <option value="500">Redondear a $500</option>
              <option value="1000">Redondear a $1000</option>
            </Select>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={compareAt} onChange={(e) => setCompareAt(e.target.checked)} className="accent-black" />
              Guardar precio actual como tachado
            </label>
          </>
        )}

        {action === "stock" && (
          <>
            <Select value={stockMode} onChange={(e) => setStockMode(e.target.value as typeof stockMode)} className="w-40">
              <option value="set">Fijar en</option>
              <option value="add">Sumar / restar</option>
            </Select>
            <Input type="number" step={1} value={stockValue} onChange={(e) => setStockValue(e.target.value)} className="w-24" />
          </>
        )}

        {(action === "tags_add" || action === "tags_remove") && (
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="etiqueta1, etiqueta2" className="w-56" />
        )}

        <Button type="button" onClick={run} disabled={pending} variant={action === "delete" ? "danger" : "primary"}>
          {pending ? "Aplicando…" : "Aplicar"}
        </Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
