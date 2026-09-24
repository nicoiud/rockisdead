import { BASE, db, launch, watch, ok } from "./common.mjs";
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:54324";
await db.connect();
const browser = await launch();
const page = await browser.newPage();
const errors = [];
watch(page, errors);

console.log("Cliente: registro, confirmación, login y cuenta");
await page.goto(BASE + "/registro");
await page.fill('input[name="full_name"]', "Invitado Prueba");
await page.fill('input[name="email"]', "invitado@test.com");
await page.fill('input[name="password"]', "clave-segura-123");
await page.getByRole("button", { name: "Crear cuenta" }).click();
await page.getByText("Te enviamos un email").waitFor();
ok(true, "registro pide confirmar email");

// Buscar el email de confirmación en Mailpit
let link = null;
for (let i = 0; i < 20 && !link; i++) {
  const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  const msg = list.messages?.find((m) => m.To?.[0]?.Address === "invitado@test.com");
  if (msg) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
    link = full.HTML.match(/href="([^"]+verify[^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  }
  if (!link) await new Promise((r) => setTimeout(r, 500));
}
ok(!!link, "email de confirmación recibido");
await page.goto(link);
await page.waitForURL(/\/(cuenta|login)/);
if (page.url().includes("/login")) {
  // Flujo implícito (hash): iniciar sesión manualmente
  await page.fill('input[name="email"]', "invitado@test.com");
  await page.fill('input[name="password"]', "clave-segura-123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/cuenta/);
}
ok(page.url().includes("/cuenta"), "cuenta confirmada y logueado");

await page.goto(BASE + "/cuenta/pedidos");
const rows = await page.locator("tbody tr").count();
ok(rows === 1, "pedido hecho como invitado aparece en Mis pedidos");
await page.locator("tbody tr a", { hasText: "Ver detalle" }).click();
await page.getByText("Seguimiento").waitFor();
ok(await page.getByRole("link", { name: "Completar pago" }).isVisible(), "detalle de pedido con link para completar pago");

// Datos personales
await page.goto(BASE + "/cuenta");
await page.fill('input[name="phone"]', "1199998888");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText("Datos actualizados").waitFor();
const { rows: [prof] } = await db.query("select phone, role from profiles where email='invitado@test.com'");
ok(prof.phone === "1199998888" && prof.role === "customer", "perfil actualizado, rol cliente");

// Direcciones
await page.goto(BASE + "/cuenta/direcciones");
const form = page.locator("form").filter({ has: page.locator('input[name="street"]') }).last();
await form.locator('input[name="label"]').fill("Casa");
await form.locator('input[name="recipient"]').fill("Invitado Prueba");
await form.locator('input[name="street"]').fill("Santa Fe");
await form.locator('input[name="number"]').fill("3000");
await form.locator('input[name="city"]').fill("CABA");
await form.locator('input[name="province"]').fill("CABA");
await form.locator('input[name="postal_code"]').fill("1425");
await form.getByRole("button", { name: "Guardar dirección" }).click();
await page.getByText("Dirección guardada").waitFor();
ok(true, "dirección guardada");

// Compra logueado con dirección guardada y Mercado Pago (sin credenciales => error controlado)
await page.goto(BASE + "/productos/buzo-rid-oversize");
await page.getByRole("button", { name: "XXL", exact: true }).click();
ok(await page.getByText("$ 72.000").first().isVisible(), "precio propio de variante XXL");
await page.getByRole("button", { name: "Agregar al carrito" }).click();
await page.getByText("Agregado al carrito").waitFor();
await page.goto(BASE + "/checkout");
ok(await page.locator('input[name="email"]').inputValue() === "invitado@test.com", "checkout precargado con datos del usuario");
await page.getByText("Envío a domicilio CABA").click();
ok(await page.locator('select[name="address_id"]').isVisible(), "ofrece dirección guardada");
await page.getByText("Mercado Pago", { exact: true }).click();
await page.getByRole("button", { name: "Pagar con Mercado Pago" }).click();
await page.waitForURL(/mp_error=1/);
ok(await page.getByText("No pudimos conectar con Mercado Pago").isVisible(), "sin credenciales MP: pedido creado y aviso para reintentar");
const { rows: [o2] } = await db.query("select * from orders where email='invitado@test.com' and payment_method='mercado_pago'");
ok(o2.user_id && o2.status === "pending_payment" && o2.shipping_address.street === "Santa Fe", "pedido MP pendiente, vinculado al usuario y con dirección guardada");

// Otro usuario no ve pedidos ajenos
const ctx2 = await browser.newPage();
await ctx2.goto(BASE + "/cuenta/pedidos/" + o2.id);
ok(ctx2.url().includes("/login"), "sin sesión /cuenta redirige a login");

// Cliente no puede entrar al admin
await page.goto(BASE + "/admin");
ok(!page.url().includes("/admin"), "cliente no accede al admin");

console.log(errors.length ? "ERRORES:\n" + errors.join("\n") : "Sin errores de consola/servidor");
await browser.close();
await db.end();
