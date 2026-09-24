import { RANGE_LABEL, type DateRange } from "@/lib/dates";
import { Button, Input, Select } from "@/components/ui";
import type { ReactNode } from "react";

/** Filtro de rango de fechas (GET) + filtros extra en la misma fila. */
export function RangeFilter({ range, children }: { range: DateRange; children?: ReactNode }) {
  return (
    <form className="mb-6 flex flex-wrap items-end gap-3 border border-neutral-200 bg-white p-3">
      <label className="space-y-1">
        <span className="block text-xs font-semibold uppercase">Período</span>
        <Select name="rango" defaultValue={range.preset} className="w-44">
          {Object.entries(RANGE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </Select>
      </label>
      <label className="space-y-1">
        <span className="block text-xs font-semibold uppercase">Desde</span>
        <Input type="date" name="desde" defaultValue={range.fromYmd} className="w-40" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs font-semibold uppercase">Hasta</span>
        <Input type="date" name="hasta" defaultValue={range.toYmd} className="w-40" />
      </label>
      {children}
      <Button type="submit">Aplicar</Button>
      <p className="w-full text-xs text-neutral-500">Para usar fechas propias elegí “Personalizado”.</p>
    </form>
  );
}
