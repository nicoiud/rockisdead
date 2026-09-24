import type { ProductOption } from "./types";

/** Limpia opciones: recorta espacios, elimina vacías y duplicados. */
export function normalizeOptions(options: ProductOption[]): ProductOption[] {
  const seen = new Set<string>();
  const out: ProductOption[] = [];
  for (const opt of options) {
    const name = opt.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const values: string[] = [];
    const seenValues = new Set<string>();
    for (const raw of opt.values) {
      const v = raw.trim();
      if (!v || seenValues.has(v.toLowerCase())) continue;
      seenValues.add(v.toLowerCase());
      values.push(v);
    }
    if (values.length) out.push({ name, values });
  }
  return out;
}

/** Todas las combinaciones de valores. Sin opciones => una variante única {}. */
export function combinations(options: ProductOption[]): Record<string, string>[] {
  let result: Record<string, string>[] = [{}];
  for (const opt of options) {
    const next: Record<string, string>[] = [];
    for (const partial of result) {
      for (const value of opt.values) next.push({ ...partial, [opt.name]: value });
    }
    result = next;
  }
  return result;
}

/** "L / Negro" según el orden de las opciones del producto. */
export function variantTitle(options: ProductOption[], values: Record<string, string>): string {
  const names = options.length ? options.map((o) => o.name) : Object.keys(values);
  return names
    .map((n) => values[n])
    .filter(Boolean)
    .join(" / ");
}

/** Clave estable para comparar combinaciones (independiente del orden y mayúsculas). */
export function optionsKey(values: Record<string, string>): string {
  return Object.keys(values)
    .map((k) => [k.trim().toLowerCase(), String(values[k]).trim().toLowerCase()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

/** Reconstruye las opciones de un producto a partir de sus variantes, respetando un orden base. */
export function optionsFromVariants(
  names: string[],
  variants: Record<string, string>[],
  base: ProductOption[] = [],
): ProductOption[] {
  return names.map((name) => {
    const values = [...(base.find((o) => o.name.toLowerCase() === name.toLowerCase())?.values ?? [])];
    const lower = new Set(values.map((v) => v.toLowerCase()));
    for (const v of variants) {
      const val = v[name];
      if (val && !lower.has(val.toLowerCase())) {
        lower.add(val.toLowerCase());
        values.push(val);
      }
    }
    // Solo valores efectivamente usados por alguna variante
    return { name, values: values.filter((val) => variants.some((v) => v[name]?.toLowerCase() === val.toLowerCase())) };
  });
}
