import type { NextRequest } from "next/server";
import { assertStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { filtersFromParams, loadProductsForExport, productIdsForFilter } from "@/lib/admin-products";
import { exportRows, templateColumns } from "@/lib/products-io";
import { fileResponse } from "@/lib/spreadsheet";
import { ymdAR } from "@/lib/dates";

/** Exporta productos + variantes (mismo formato que la importación) o descarga la plantilla. */
export async function GET(request: NextRequest) {
  try {
    await assertStaff("products");
  } catch {
    return new Response("No autorizado", { status: 403 });
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const format = sp.formato === "xlsx" ? "xlsx" : "csv";

  if (sp.plantilla) {
    const columns = templateColumns(2);
    const example = [
      { handle: "remera-ejemplo", nombre: "Remera Ejemplo", descripcion: "Algodón peinado", categoria: "Remeras", precio: 30000, precio_anterior: "", estado: "publicado", destacado: "no", etiquetas: "nuevo, verano", imagenes: "https://ejemplo.com/foto1.jpg | https://ejemplo.com/foto2.jpg", opcion1_nombre: "Talle", opcion1_valor: "M", opcion2_nombre: "Color", opcion2_valor: "Negro", sku: "REJ-M-NEG", precio_variante: "", precio_anterior_variante: "", stock: 10, variante_activa: "si" },
      { handle: "remera-ejemplo", opcion1_nombre: "Talle", opcion1_valor: "L", opcion2_nombre: "Color", opcion2_valor: "Negro", sku: "REJ-L-NEG", stock: 8 },
      { handle: "gorra-ejemplo", nombre: "Gorra sin variantes", categoria: "Accesorios", precio: 15000, estado: "borrador", sku: "GOR-1", stock: 5 },
    ];
    return fileResponse(format, "plantilla-productos", columns, example);
  }

  const settings = await getSettings();
  const ids = await productIdsForFilter(filtersFromParams(sp), settings.low_stock_threshold);
  const products = await loadProductsForExport(ids);
  const { columns, rows } = exportRows(products);
  return fileResponse(format, `productos-${ymdAR()}`, columns, rows);
}
