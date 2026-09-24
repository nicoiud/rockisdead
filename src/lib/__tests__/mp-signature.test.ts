import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../mp-signature";

const secret = "mi-secreto";
function sign(id: string, requestId: string, ts: string) {
  return createHmac("sha256", secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest("hex");
}

describe("firma de webhooks de Mercado Pago", () => {
  it("acepta una firma válida", () => {
    const v1 = sign("123456", "req-1", "1700000000");
    expect(verifyWebhookSignature({ signature: `ts=1700000000,v1=${v1}`, requestId: "req-1", dataId: "123456", secret })).toBe(true);
  });
  it("normaliza ids alfanuméricos a minúsculas", () => {
    const v1 = sign("abc123", "r", "1");
    expect(verifyWebhookSignature({ signature: `ts=1,v1=${v1}`, requestId: "r", dataId: "ABC123", secret })).toBe(true);
  });
  it("rechaza firma alterada, ausente o con otro secreto", () => {
    const v1 = sign("123", "r", "1");
    expect(verifyWebhookSignature({ signature: `ts=1,v1=${v1}`, requestId: "r", dataId: "124", secret })).toBe(false);
    expect(verifyWebhookSignature({ signature: null, requestId: "r", dataId: "123", secret })).toBe(false);
    expect(verifyWebhookSignature({ signature: `ts=1,v1=${v1}`, requestId: "r", dataId: "123", secret: "otro" })).toBe(false);
    expect(verifyWebhookSignature({ signature: "basura", requestId: "r", dataId: "123", secret })).toBe(false);
  });
});
