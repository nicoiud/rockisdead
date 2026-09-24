import { describe, expect, it } from "vitest";
import { classifySource } from "../analytics";

describe("origen de tráfico", () => {
  const site = "rockisdead.com.ar";
  it.each([
    [{}, "direct"],
    [{ referrer: "https://www.google.com/" }, "search"],
    [{ referrer: "https://l.instagram.com/?u=x" }, "social"],
    [{ referrer: "https://m.facebook.com/" }, "social"],
    [{ referrer: "https://t.co/abc" }, "social"],
    [{ referrer: "https://blog.ejemplo.com/post" }, "referral"],
    [{ referrer: "https://rockisdead.com.ar/productos" }, "direct"],
    [{ utmMedium: "cpc", utmSource: "google" }, "ads"],
    [{ utmMedium: "email" }, "email"],
    [{ utmSource: "instagram" }, "social"],
  ])("%j => %s", (input, expected) => {
    expect(classifySource({ ...input, siteHost: site })).toBe(expected);
  });
});
