import http from "node:http";
// Simula la API de Mercado Pago: preferencias, checkout y consulta de pagos.
const prefs = new Map();
const payments = new Map();
let nextPayment = 9000;
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:4010");
  let body = "";
  for await (const c of req) body += c;
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "POST" && url.pathname === "/checkout/preferences") {
    if (req.headers.authorization !== "Bearer TEST-TOKEN") return json(401, { message: "invalid token" });
    const pref = JSON.parse(body);
    const id = "pref-" + (prefs.size + 1);
    prefs.set(id, pref);
    return json(201, { id, init_point: `http://localhost:4010/pay?pref=${id}`, sandbox_init_point: `http://localhost:4010/pay?pref=${id}` });
  }
  if (url.pathname === "/pay") {
    // Página de pago simulada: ?result=approved|rejected
    const pref = prefs.get(url.searchParams.get("pref"));
    const result = url.searchParams.get("result");
    if (!result) {
      res.writeHead(200, { "content-type": "text/html" });
      const total = pref.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      return res.end(`<h1>MP simulado</h1><p id="total">${total}</p><a href="?pref=${url.searchParams.get("pref")}&result=approved">Pagar</a> <a href="?pref=${url.searchParams.get("pref")}&result=rejected">Rechazar</a>`);
    }
    const id = String(nextPayment++);
    const total = pref.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    payments.set(id, { id: Number(id), status: result, status_detail: result === "approved" ? "accredited" : "cc_rejected_other_reason", external_reference: pref.external_reference, transaction_amount: total, date_approved: null, payment_method_id: "visa", payment_type_id: "credit_card" });
    const back = result === "approved" ? pref.back_urls.success : pref.back_urls.failure;
    res.writeHead(302, { location: `${back}&payment_id=${id}&status=${result}&collection_status=${result}` });
    return res.end();
  }
  const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
  if (m) return payments.has(m[1]) ? json(200, payments.get(m[1])) : json(404, { message: "not found" });
  if (url.pathname === "/_last") return json(200, [...prefs.values()].at(-1));
  if (url.pathname === "/_set" ) { const p = JSON.parse(body); payments.set(String(p.id), p); return json(200, {}); }
  json(404, {});
}).listen(4010, () => console.log("mp mock on 4010"));
