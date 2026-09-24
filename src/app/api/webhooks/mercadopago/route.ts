import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/mercadopago";
import { syncMercadoPagoPayment } from "@/lib/payments";
import { getPrivateSettings } from "@/lib/settings";

/**
 * Webhook de Mercado Pago (notificaciones de pagos).
 * Configurar en MP: URL https://TU-DOMINIO/api/webhooks/mercadopago, evento "Pagos".
 * Si se carga la "clave secreta" del webhook en el admin, se valida la firma.
 */
export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    body = await request.json();
  } catch {
    // Algunas notificaciones (IPN) llegan solo por query string
  }

  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (type !== "payment" || !dataId) return NextResponse.json({ ignored: true });

  const { mp_webhook_secret } = await getPrivateSettings();
  if (mp_webhook_secret) {
    const valid = verifyWebhookSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: url.searchParams.get("data.id") ?? dataId,
      secret: mp_webhook_secret,
    });
    if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    const result = await syncMercadoPagoPayment(dataId);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[webhook mp]", e);
    // 500 => MP reintenta la notificación
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}
