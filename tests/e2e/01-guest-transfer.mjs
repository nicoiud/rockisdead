import { BASE, db, launch, watch, ok } from "./common.mjs";
await db.connect();
const browser = await launch();
const page = await browser.newPage();
const errors = [];
watch(page, errors);

console.log("Invitado: compra con transferencia");
await page.goto(BASE + "/?utm_source=instagram&utm_medium=social");
ok(await page.getByRole("heading", { name: "Destacados" }).isVisible(), "home muestra destacados");
await page.getByRole("link", { name: /Remera Dead Skull/ }).first().click();
await page.waitForURL(/remera-dead-skull/);
await page.getByRole("button", { name: "L", exact: true }).click();
await page.getByRole("button", { name: "Blanco", exact: true }).click();
await page.locator('input[name="quantity"]').fill("2");
await page.getByRole("button", { name: "Agregar al carrito" }).click();
await page.getByText("Agregado al carrito").waitFor();
ok(true, "agregado al carrito (L / Blanco x2)");

// Intentar agregar más del stock
await page.locator('input[name="quantity"]').fill("9");
await page.getByRole("button", { name: "Agregar al carrito" }).click();
await page.getByText(/Solo hay 10 unidades/).waitFor();
ok(true, "valida stock disponible al agregar");

await page.goto(BASE + "/carrito");
ok(await page.getByText("L / Blanco").isVisible(), "carrito muestra variante");
ok(await page.getByText("$ 64.000").first().isVisible(), "subtotal 2 x 32.000");
await page.getByRole("link", { name: "Continuar compra" }).click();
await page.waitForURL(/checkout/);

await page.fill('input[name="email"]', "invitado@test.com");
await page.fill('input[name="customer_name"]', "Invitado Prueba");
await page.fill('input[name="phone"]', "1122334455");
await page.getByText("Envío a domicilio CABA").click();
await page.fill('input[name="street"]', "Corrientes");
await page.fill('input[name="number"]', "1234");
await page.fill('input[name="city"]', "CABA");
await page.selectOption('select[name="province"]', "CABA");
await page.fill('input[name="postal_code"]', "1043");
await page.getByText("Transferencia bancaria").click();
await page.getByRole("button", { name: "Confirmar pedido" }).click();
await page.waitForURL(/\/pedido\/.+\?t=/);
ok(await page.getByText("Datos para transferir").isVisible(), "muestra datos bancarios");
ok(await page.getByText("ROCK.IS.DEAD").isVisible(), "muestra alias");
const orderUrl = page.url();

const { rows: [order] } = await db.query("select * from orders where email='invitado@test.com' order by created_at desc limit 1");
ok(order.status === "pending_transfer", "pedido en pendiente_transferencia");
ok(Number(order.total) === 64000 + 4500, "total = 64000 + envío 4500");
const { rows: [v] } = await db.query("select stock from product_variants where sku='RDS-L-BLA'");
ok(v.stock === 10, "stock NO se descuenta antes del pago");
const { rows: [cartCount] } = await db.query("select count(*)::int n from cart_items");
ok(cartCount.n === 0, "carrito vaciado tras el pedido");

await page.setInputFiles('input[name="receipt"]', "receipt.png");
await page.getByRole("button", { name: "Enviar comprobante" }).click();
await page.getByText("¡Recibimos tu comprobante!").waitFor();
const { rows: [pay] } = await db.query("select status, receipt_path from payments where order_id=$1", [order.id]);
ok(pay.status === "in_review" && pay.receipt_path, "comprobante guardado y pago en revisión");

// El link sin token no debe dar acceso
const other = await browser.newPage();
const resp = await other.goto(`${BASE}/pedido/${order.id}`);
ok(resp.status() === 404, "pedido sin token => 404");

const { rows: views } = await db.query("select path, source from page_views order by id");
ok(views.length >= 3, `visitas registradas (${views.length})`);
ok(views[0].source === "social", "origen instagram => social");

console.log(JSON.stringify({ orderId: order.id, orderUrl }));
console.log(errors.length ? "ERRORES:\n" + errors.join("\n") : "Sin errores de consola/servidor");
await browser.close();
await db.end();
