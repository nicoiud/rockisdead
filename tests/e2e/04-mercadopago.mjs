import { createHmac } from "node:crypto";
import { BASE, db, launch, watch, ok } from "./common.mjs";
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
await q("update private_settings set mp_access_token='TEST-TOKEN', mp_webhook_secret='whsec'");
await q("update product_variants set stock=10 where sku='GDL-U'");
const browser = await launch();
const errors = [];

async function buyGorra(email) {
  const page = await browser.newPage();
  watch(page, errors);
  await page.goto(BASE + "/productos/gorra-dead-logo");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.getByText("Agregado al carrito").waitFor();
  await page.goto(BASE + "/checkout");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="customer_name"]', "Cliente MP");
  await page.fill('input[name="phone"]', "1100000000");
  await page.getByText("Retiro en el local").click();
  await page.getByText("Mercado Pago", { exact: true }).click();
  await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click();
  await page.waitForURL(/localhost:4010\/pay/);
  return page;
}

console.log("Mercado Pago (API simulada)");
// 1) Pago aprobado vía URL de retorno
let page = await buyGorra("mp1@test.com");
let [order] = await q("select * from orders where email='mp1@test.com'");
ok(order.status === "pending_payment", "pedido creado en pendiente antes de pagar");
const total = Number(await page.locator("#total").textContent());
ok(total === Number(order.total), `la preferencia cobra el total exacto (${total})`);
const pref = await (await fetch("http://localhost:4010/_last")).json();
ok(pref.external_reference === order.id && pref.back_urls.success.includes(order.access_token), "preferencia con referencia al pedido y URL de retorno");
await page.getByText("Pagar").click();
await page.waitForURL(/\/pedido\//);
await page.getByText("¡Pago confirmado!").waitFor();
[order] = await q("select * from orders where email='mp1@test.com'");
ok(order.status === "paid" && order.stock_applied, "pedido pagado y stock aplicado al volver de MP");
ok((await q("select stock from product_variants where sku='GDL-U'"))[0].stock === 9, "stock descontado");
const [p1] = await q("select status, mp_payment_id from payments where order_id=$1", [order.id]);
ok(p1.status === "approved" && p1.mp_payment_id, "pago registrado con id de MP");
await page.reload();
ok((await q("select stock from product_variants where sku='GDL-U'"))[0].stock === 9, "recargar la página no descuenta dos veces");

// 2) Rechazado y reintento
page = await buyGorra("mp2@test.com");
await page.getByText("Rechazar").click();
await page.waitForURL(/\/pedido\//);
await page.getByText("El pago anterior fue rechazado").waitFor();
let [o2] = await q("select * from orders where email='mp2@test.com'");
ok(o2.status === "rejected", "pago rechazado => pedido rechazado");
await page.getByRole("button", { name: /Pagar/ }).click();
await page.waitForURL(/localhost:4010\/pay/);
await page.getByText("Pagar").click();
await page.getByText("¡Pago confirmado!").waitFor();
[o2] = await q("select * from orders where email='mp2@test.com'");
ok(o2.status === "paid", "reintento aprobado => pagado");

// 3) Webhook con firma válida (idempotente) y monto incorrecto
page = await buyGorra("mp3@test.com");
const [o3] = await q("select * from orders where email='mp3@test.com'");
async function webhook(id) {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", "whsec").update(`id:${id};request-id:req-${id};ts:${ts};`).digest("hex");
  return fetch(`${BASE}/api/webhooks/mercadopago?data.id=${id}&type=payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": `req-${id}` },
    body: JSON.stringify({ type: "payment", action: "payment.created", data: { id } }),
  });
}
await fetch("http://localhost:4010/_set", { method: "POST", body: JSON.stringify({ id: 7777, status: "approved", status_detail: "accredited", external_reference: o3.id, transaction_amount: Number(o3.total) - 1000 }) });
let r = await webhook("7777");
ok(r.status === 200 && (await r.json()).status === "monto_incorrecto", "webhook: monto menor al total NO marca pagado");
ok((await q("select status from orders where id=$1", [o3.id]))[0].status === "pending_payment", "pedido sigue pendiente");
await fetch("http://localhost:4010/_set", { method: "POST", body: JSON.stringify({ id: 7778, status: "approved", status_detail: "accredited", external_reference: o3.id, transaction_amount: Number(o3.total) }) });
const before = (await q("select stock from product_variants where sku='GDL-U'"))[0].stock;
r = await webhook("7778");
ok(r.status === 200, "webhook firmado aceptado");
r = await webhook("7778");
ok(r.status === 200, "webhook duplicado aceptado");
ok((await q("select status from orders where id=$1", [o3.id]))[0].status === "paid", "webhook marca el pedido como pagado");
ok((await q("select stock from product_variants where sku='GDL-U'"))[0].stock === before - 1, "webhook duplicado no descuenta dos veces");

console.log(errors.length ? "ERRORES:\n" + errors.join("\n") : "Sin errores de consola/servidor");
await q("update private_settings set mp_access_token=null, mp_webhook_secret=null");
await browser.close();
await db.end();
