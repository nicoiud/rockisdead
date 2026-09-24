import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { BASE_COLUMNS, VARIANT_COLUMNS } from "@/lib/products-io";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Importar / Exportar" };

export default async function ImportPage() {
  await requireStaff("products");
  return (
    <div className="space-y-6">
      <PageTitle>Importar / Exportar productos</PageTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Exportar">
          <p className="mb-3 text-sm text-neutral-600">
            Descargá todo el catálogo (una fila por variante), editalo en Excel o Google Sheets y volvé a importarlo para actualizar en masa.
            Para exportar solo una parte, filtrá en el <Link href="/admin/productos" className="underline">listado</Link> y usá los mismos parámetros.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/productos/exportar?formato=xlsx" prefetch={false}>Exportar Excel</ButtonLink>
            <ButtonLink href="/admin/productos/exportar?formato=csv" prefetch={false} variant="secondary">Exportar CSV</ButtonLink>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span>Plantilla vacía:</span>
            <Link href="/admin/productos/exportar?plantilla=1&formato=xlsx" prefetch={false} className="underline">Excel</Link>
            <Link href="/admin/productos/exportar?plantilla=1&formato=csv" prefetch={false} className="underline">CSV</Link>
          </div>
        </Card>

        <Card title="Formato">
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            <li><strong>Una fila por variante.</strong> Las filas con el mismo <code>handle</code> son el mismo producto.</li>
            <li>Columnas: {BASE_COLUMNS.join(", ")}, <code>opcion1_nombre</code>, <code>opcion1_valor</code>, <code>opcion2_…</code> (todas las que quieras), {VARIANT_COLUMNS.join(", ")}.</li>
            <li><strong>Celda vacía = no se modifica</strong> (en productos existentes).</li>
            <li>Si el <code>handle</code> existe se actualiza; si no, se crea. Las variantes se identifican por SKU o por sus opciones.</li>
            <li><code>estado</code>: publicado, borrador u oculto. <code>destacado</code> / <code>variante_activa</code>: si / no.</li>
            <li><code>imagenes</code>: URLs separadas por <code>|</code>. Si se completa, reemplaza la lista de imágenes del producto.</li>
            <li><code>stock</code> fija el stock (queda registrado en el historial).</li>
          </ul>
        </Card>
      </div>

      <Card title="2. Importar">
        <Importer />
      </Card>
    </div>
  );
}
