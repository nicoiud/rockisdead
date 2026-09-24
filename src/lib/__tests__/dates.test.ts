import { describe, expect, it } from "vitest";
import { bucketKeys, pctChange, resolveRange } from "../dates";

// 2026-09-24 01:30 UTC = 2026-09-23 22:30 en Argentina
const now = new Date("2026-09-24T01:30:00Z");

describe("rangos de fecha", () => {
  it("hoy usa el día argentino", () => {
    const r = resolveRange("today", undefined, undefined, now);
    expect(r.fromYmd).toBe("2026-09-23");
    expect(r.from.toISOString()).toBe("2026-09-23T03:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-24T03:00:00.000Z");
  });

  it("período anterior de igual duración", () => {
    const r = resolveRange("7d", undefined, undefined, now);
    expect(r.fromYmd).toBe("2026-09-17");
    expect(r.to.getTime() - r.from.getTime()).toBe(r.prevTo.getTime() - r.prevFrom.getTime());
  });

  it("semana arranca el lunes", () => {
    expect(resolveRange("week", undefined, undefined, now).fromYmd).toBe("2026-09-21");
  });

  it("mes anterior", () => {
    const r = resolveRange("last_month", undefined, undefined, now);
    expect([r.fromYmd, r.toYmd]).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("personalizado inválido cae en 30 días", () => {
    expect(resolveRange("custom", "2026-09-10", "2026-09-01", now).preset).toBe("30d");
  });

  it("buckets", () => {
    expect(bucketKeys({ fromYmd: "2026-01-30", toYmd: "2026-02-02", bucket: "day" })).toEqual([
      "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02",
    ]);
    expect(bucketKeys({ fromYmd: "2026-01-15", toYmd: "2026-03-02", bucket: "month" })).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01",
    ]);
  });

  it("variación porcentual", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(10, 0)).toBeNull();
  });
});
