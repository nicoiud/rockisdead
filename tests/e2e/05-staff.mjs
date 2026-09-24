import { BASE, launch, ok } from "./common.mjs";
const b = await launch(); const p = await b.newPage();
await p.goto(BASE + "/login?next=/admin");
await p.fill('input[name="email"]', "invitado@test.com");
await p.fill('input[name="password"]', "clave-segura-123");
await p.getByRole("button", { name: "Ingresar" }).click();
await p.waitForURL(/\/admin/);
const nav = await p.locator("aside nav").innerText();
ok(nav.includes("PEDIDOS") && nav.includes("PRODUCTOS") && !nav.includes("VENTAS") && !nav.includes("CONFIGURACIÓN"), "menú filtrado por permisos");
for (const path of ["/admin/reportes", "/admin/configuracion", "/admin/usuarios", "/admin/visitas"]) {
  await p.goto(BASE + path);
  ok(p.url().includes("error=permiso"), `sin permiso: ${path} redirige`);
}
const exp = await p.request.get(BASE + "/admin/productos/exportar?formato=csv");
ok(exp.status() === 200, "puede exportar productos (tiene permiso)");
await p.goto(BASE + "/admin/pedidos");
ok(p.url().endsWith("/admin/pedidos"), "accede a pedidos");
await b.close();
