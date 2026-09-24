import { BASE, db, launch, watch, ok } from "./common.mjs";
import fs from "node:fs";
await db.connect();
const browser = await launch();
const page = await browser.newPage();
const errors = [];
watch(page, errors);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

console.log("Admin");
await page.goto(BASE + "/login?next=/admin");
await page.fill('input[name="email"]', "admin@rid.test");
await page.fill('input[name="password"]', "admin-clave-123");
await page.getByRole("button", { name: "Ingresar" }).click();
await page.waitForURL(/\/admin$/);
await page.getByRole("heading", { name: "Dashboard" }).waitFor(); ok(true, "dashboard carga");
await page.locator(".recharts-surface").nth(1).waitFor(); ok(await page.locator(".recharts-surface").count() >= 2, "gráficos de ventas y visitas renderizados");
await page.getByText(/Pendientes de pago/).waitFor(); ok(true, "tarjeta de pendientes de pago");

// ---- Pedidos ----
await page.goto(BASE + "/admin/pedidos?estado=review");
ok(await page.locator("tbody tr").count() === 1, "filtro 'comprobante a revisar' muestra el pedido");
await page.locator("tbody tr a").first().click();
await page.getByText("Revisar transferencia").waitFor();
await page.getByRole("link", { name: /Ver comprobante/ }).waitFor(); ok(true, "comprobante visible con URL firmada");
const [transferOrder] = await q("select id from orders where payment_method='transfer'");
await page.getByRole("button", { name: "✓ Confirmar pago" }).click();
await page.locator("h1", { hasText: "Pagado" }).waitFor();
let [o] = await q("select status, stock_applied from orders where id=$1", [transferOrder.id]);
ok(o.status === "paid" && o.stock_applied, "transferencia confirmada => pagado");
let [v] = await q("select stock from product_variants where sku='RDS-L-BLA'");
ok(v.stock === 8, "stock descontado (10 - 2)");
const [pay] = await q("select status from payments where order_id=$1", [transferOrder.id]);
ok(pay.status === "approved", "pago aprobado");

await page.reload();
await page.selectOption('select[name="status"]', "shipped");
await page.fill('input[name="tracking_code"]', "CA123456789AR");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText("Estado actualizado").waitFor();
[o] = await q("select status, tracking_code from orders where id=$1", [transferOrder.id]);
ok(o.status === "shipped" && o.tracking_code === "CA123456789AR", "estado enviado + seguimiento");

await page.reload();
await page.selectOption('select[name="status"]', "cancelled");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText("Estado actualizado").waitFor();
[v] = await q("select stock from product_variants where sku='RDS-L-BLA'");
ok(v.stock === 10, "cancelar repone el stock");
await page.reload();
await page.selectOption('select[name="status"]', "delivered");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText("Estado actualizado").waitFor();
[v] = await q("select stock from product_variants where sku='RDS-L-BLA'");
ok(v.stock === 8, "reactivar (entregado) vuelve a descontar");

for (const fmt of ["csv", "xlsx"]) {
  const res = await page.request.get(`${BASE}/admin/pedidos/exportar?formato=${fmt}`);
  const body = await res.body();
  ok(res.status() === 200 && body.length > 100, `exportar pedidos ${fmt} (${body.length} bytes)`);
  if (fmt === "csv") ok(body.toString().includes("Invitado Prueba"), "CSV contiene el cliente");
}
await page.goto(BASE + "/admin/pedidos?metodo=mercado_pago&min=1&q=invitado");
ok(await page.locator("tbody tr").count() === 1, "filtros combinados (método + monto + cliente)");

// ---- Productos: listado + acciones masivas ----
await page.goto(BASE + "/admin/productos");
ok(await page.locator("tbody tr").count() === 3, "listado de productos");
await page.locator('tbody input[type="checkbox"]').nth(0).check();
await page.locator('tbody input[type="checkbox"]').nth(1).check();
await page.locator("select").filter({ hasText: "Publicar" }).selectOption("hide");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Aplicar" }).click();
await page.getByText("Listo: 2 producto(s)").waitFor();
ok((await q("select count(*)::int n from products where status='inactive'"))[0].n === 2, "ocultar 2 productos seleccionados");

await page.goto(BASE + "/admin/productos?estado=inactive");
await page.locator('thead input[type="checkbox"]').check();
await page.locator("select").filter({ hasText: "Publicar" }).selectOption("publish");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Aplicar" }).click();
await page.getByText(/Listo: 2/).waitFor();
ok((await q("select count(*)::int n from products where status='active'"))[0].n === 3, "publicación masiva");

await page.goto(BASE + "/admin/productos");
await page.locator('thead input[type="checkbox"]').check();
await page.locator("select").filter({ hasText: "Publicar" }).selectOption("price");
await page.locator('input[placeholder="ej. 10 o -15"]').fill("10");
await page.locator("select").filter({ hasText: "Sin redondeo" }).selectOption("500");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Aplicar" }).click();
await page.getByText(/Listo: 3/).waitFor();
const prices = await q("select slug, price from products order by slug");
ok(prices.find((p) => p.slug === "remera-dead-skull").price === "35000.00", "precios +10% redondeados a $500");

// ---- Grilla masiva ----
await page.goto(BASE + "/admin/productos/masivo?q=remera");
const grid = page.locator("table");
const stockInputs = grid.locator("tbody tr").filter({ hasText: "S / Negro" }).locator("input.text-right");
await stockInputs.nth(2).fill("33");
await stockInputs.nth(2).press("Enter");
// Seleccionar todas las variantes y aplicar "activa = no" a través de "aplicar a seleccionadas"
await page.getByRole("button", { name: "Seleccionar todo lo visible" }).click();
await page.locator("select").filter({ hasText: "Precio tachado" }).first().selectOption("v:stock");
await page.locator('input[placeholder="Valor (vacío = sin valor)"]').fill("5");
await page.getByRole("button", { name: "Sumar a seleccionadas" }).click();
await page.getByRole("button", { name: /Guardar \d+ cambio/ }).click();
await page.getByText(/Se guardaron/).waitFor();
const [sn] = await q("select stock from product_variants where sku='RDS-S-NEG'");
ok(sn.stock === 38, "grilla: edición de celda (33) + sumar 5 a seleccionadas = 38");
const [ml] = await q("select stock from product_variants where sku='RDS-M-BLA'");
ok(ml.stock === 15, "grilla: sumar 5 al resto de variantes");
const [mv] = await q("select count(*)::int n from stock_movements where reason='bulk'");
ok(mv.n === 8, "movimientos de stock 'edición masiva' registrados");

await page.goto(BASE + "/admin/productos/masivo");
await page.getByRole("button", { name: "Solo productos" }).click();
const nameInput = page.locator("tbody tr").filter({ has: page.locator('input[value="Gorra Dead Logo"]') }).locator("input").nth(1);
await nameInput.fill("Gorra Dead Logo Negra");
await page.getByRole("button", { name: /Guardar 1 cambio/ }).click();
await page.getByText(/Se guardaron 1/).waitFor();
ok((await q("select name from products where slug='gorra-dead-logo'"))[0].name === "Gorra Dead Logo Negra", "grilla modo productos: renombrar");

// ---- Importación ----
const csv = [
  "handle,nombre,precio,categoria,estado,opcion1_nombre,opcion1_valor,opcion2_nombre,opcion2_valor,opcion3_nombre,opcion3_valor,sku,stock",
  "jean-slim,Jean Slim,55.000,Pantalones Nuevos,borrador,Talle,40,Largo,32,Lavado,Oscuro,JS-40-32-OSC,4",
  "jean-slim,,,,,Talle,42,Largo,32,Lavado,Oscuro,JS-42-32-OSC,6",
  "gorra-dead-logo,,,,,,,,,,,GDL-U,99",
  "malo,,xx,,,,,,,,,,",
].join("\n");
fs.writeFileSync("import.csv", csv);
await page.goto(BASE + "/admin/productos/importar");
await page.getByText("Publicar todos los productos importados").click();
await page.setInputFiles('input[type="file"]', "import.csv");
await page.getByText("Productos nuevos").waitFor();
await page.getByText(/1 error\(es\)/).waitFor(); ok(true, "vista previa detecta la fila con error");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Aplicar importación" }).click();
await page.getByText(/Importación terminada: 2/).waitFor();
const [jean] = await q("select id, status, options, (select name from categories where id=category_id) cat from products where slug='jean-slim'");
ok(jean && jean.status === "active" && jean.cat === "Pantalones Nuevos", "producto nuevo con 3 opciones, publicado y categoría creada");
ok(jean.options.length === 3 && jean.options[0].values.join() === "40,42", "opciones reconstruidas desde variantes");
ok((await q("select stock from product_variants where sku='GDL-U'"))[0].stock === 99, "stock actualizado por SKU");

// Round-trip: exportar y reimportar sin errores
const exp = await page.request.get(`${BASE}/admin/productos/exportar?formato=xlsx`);
fs.writeFileSync("export.xlsx", await exp.body());
await page.goto(BASE + "/admin/productos/importar");
await page.setInputFiles('input[type="file"]', "export.xlsx");
await page.getByText("Productos a actualizar").waitFor();
ok(!(await page.getByText(/error\(es\)/).isVisible()), "export Excel se reimporta sin errores");
const updated = await page.locator("text=Productos a actualizar").locator("..").locator("p").nth(1).textContent();
ok(updated === "4", "round-trip detecta 4 productos existentes");

// ---- Editor de producto nuevo ----
await page.goto(BASE + "/admin/productos/nuevo");
await page.locator("label", { hasText: "Nombre" }).locator("input").first().fill("Camisa Leñador");
await page.locator("label", { hasText: /^Precio/ }).first().locator("input").fill("48000");
await page.getByRole("button", { name: "+ Agregar opción" }).click();
await page.locator('input[placeholder="Nombre (ej. Talle)"]').fill("Talle");
await page.locator('input[placeholder="Valores: S, M, L, XL"]').fill("M, L, XL");
await page.getByRole("button", { name: "+ Agregar opción" }).click();
await page.locator('input[placeholder="Nombre (ej. Talle)"]').nth(1).fill("Color");
await page.locator('input[placeholder="Valores: S, M, L, XL"]').nth(1).fill("Rojo, Verde");
await page.getByRole("button", { name: /Generar variantes \(6\)/ }).click();
await page.locator('input[placeholder="Stock"]').fill("7");
await page.locator('input[placeholder="Prefijo SKU"]').fill("CAM");
await page.getByRole("button", { name: "Aplicar", exact: true }).click();
await page.setInputFiles('input[type="file"][multiple]', "receipt.png");
await page.getByText("Principal").waitFor();
await page.locator("label", { hasText: "Estado" }).locator("select").selectOption("active");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForURL(/\/admin\/productos\/[0-9a-f-]{36}/);
const [cam] = await q("select id, slug, status from products where name='Camisa Leñador'");
ok(cam && cam.slug === "camisa-lenador", "producto creado con slug sin acentos");
const camV = await q("select sku, stock, title from product_variants where product_id=$1 order by position", [cam.id]);
ok(camV.length === 6 && camV.every((x) => x.stock === 7) && camV[0].sku === "CAM-M-ROJO" && camV[0].title === "M / Rojo", "6 variantes con stock y SKU generados");
const imgs = await q("select url, path from product_images where product_id=$1", [cam.id]);
ok(imgs.length === 1 && imgs[0].path, "imagen subida a Storage desde el navegador (RLS staff)");
ok((await fetch(imgs[0].url.replace("localhost:54321", "localhost:54321"))).status === 200, "imagen pública accesible");

// Editar: quitar un valor de opción y regenerar
await page.reload();
await page.locator('input[placeholder="Valores: S, M, L, XL"]').first().fill("M, L");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: /Generar variantes \(4\)/ }).click();
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText("Producto guardado").waitFor();
ok((await q("select count(*)::int n from product_variants where product_id=$1", [cam.id]))[0].n === 4, "regenerar variantes elimina las que sobran");

// En la tienda
const shop = await browser.newPage();
await shop.goto(BASE + "/productos/camisa-lenador");
await shop.getByRole("button", { name: "Verde", exact: true }).waitFor(); ok(true, "producto visible en la tienda con sus opciones");
await shop.close();

// ---- Categorías / stock ----
await page.goto(BASE + "/admin/categorias");
const newCat = page.locator("form").filter({ has: page.locator('input[name="name"]') }).first();
await newCat.locator('input[name="name"]').fill("Camisas Premium");
await newCat.getByRole("button", { name: "Agregar" }).click();
await page.getByText("Categoría guardada").waitFor();
ok((await q("select slug from categories where name='Camisas Premium'"))[0]?.slug === "camisas-premium", "categoría creada");

await page.goto(BASE + "/admin/stock");
const gorraOpt = await page.locator('select[name="variant_id"] option', { hasText: "Gorra Dead Logo Negra" }).getAttribute("value");
await page.locator('select[name="variant_id"]').selectOption(gorraOpt);
await page.locator('select[name="mode"]').selectOption("add");
await page.fill('input[name="value"]', "-4");
await page.fill('input[name="note"]', "Falla");
await page.getByRole("button", { name: "Ajustar" }).click();
await page.getByText("Stock actualizado: 95").waitFor();
ok(true, "ajuste manual de stock (99 - 4 = 95)");
await page.reload();
await page.getByText("Falla").first().waitFor(); ok(true, "historial de movimientos muestra el ajuste");

// ---- Reportes / visitas / usuarios / config ----
for (const path of ["/admin/reportes?rango=7d", "/admin/reportes?rango=custom&desde=2026-01-01&hasta=2026-12-31&metrica=units", "/admin/visitas", "/admin/visitas?usuarios=guest&origen=social", "/admin/usuarios", "/admin/configuracion"]) {
  const r = await page.goto(BASE + path);
  ok(r.status() === 200, `carga ${path}`);
}
await page.goto(BASE + "/admin/reportes?rango=7d");
await page.locator("li", { hasText: "Remera Dead Skull" }).first().waitFor(); ok(true, "reporte: productos más vendidos");
await page.goto(BASE + "/admin/usuarios?min_compras=1");
ok(await page.locator("tbody tr").count() === 1, "usuarios filtrados por cantidad de compras");
await page.locator("tbody tr a").first().click();
await page.getByText("Historial de pedidos").waitFor();
ok(await page.locator("tbody tr").count() === 2, "historial de pedidos del usuario");

await page.goto(BASE + "/admin/configuracion");
const payForm = page.locator("form").filter({ hasText: "Mercado Pago" }).first();
await payForm.locator('input[name="transfer_discount_pct"]').fill("10");
await payForm.locator('input[name="mp_webhook_secret"]').fill("secreto-webhook");
await payForm.getByRole("button", { name: "Guardar pagos" }).click();
await page.getByText("Guardado").first().waitFor();
ok((await q("select transfer_discount_pct from store_settings"))[0].transfer_discount_pct === "10.00", "config: descuento transferencia");
ok((await q("select mp_webhook_secret from private_settings"))[0].mp_webhook_secret === "secreto-webhook", "config: secreto MP guardado en tabla privada");
const shipForm = page.locator("form").filter({ has: page.locator('input[name="free_over"]') }).last();
await shipForm.locator('input[name="name"]').fill("Andreani");
await shipForm.locator('input[name="price"]').fill("9000");
await shipForm.getByRole("button", { name: "Agregar" }).click();
await page.getByText("Método de envío guardado").waitFor();
ok((await q("select count(*)::int n from shipping_methods where name='Andreani'"))[0].n === 1, "config: nuevo método de envío");

// ---- APIs ----
const wh = await fetch(BASE + "/api/webhooks/mercadopago?data.id=123&type=payment", { method: "POST", body: JSON.stringify({ type: "payment", data: { id: "123" } }), headers: { "x-signature": "ts=1,v1=bad" } });
ok(wh.status === 401, "webhook MP con firma inválida => 401");
ok((await fetch(BASE + "/api/cron/weekly-report")).status === 401, "cron sin secreto => 401");
const cron = await fetch(BASE + "/api/cron/weekly-report", { headers: { authorization: "Bearer test-cron-secret" } });
ok(cron.status === 200 && (await cron.json()).sent === true, "reporte semanal generado");

// Staff con permisos limitados
await page.goto(BASE + "/admin/usuarios");
const addForm = page.locator("form").filter({ hasText: "Si el email no tiene cuenta" });
await addForm.locator('input[name="email"]').fill("invitado@test.com");
await addForm.getByRole("button", { name: "Agregar" }).click();
await page.getByText("Permisos asignados").waitFor();
const [st] = await q("select role, permissions from profiles where email='invitado@test.com'");
ok(st.role === "staff" && st.permissions.join() === "products,orders", "staff con permisos productos + pedidos");

console.log(errors.length ? "ERRORES:\n" + errors.join("\n") : "Sin errores de consola/servidor");
await browser.close();
await db.end();
