export type TrafficSource = "direct" | "search" | "social" | "email" | "ads" | "referral";

const SEARCH = ["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "yandex.", "baidu."];
const SOCIAL = [
  "instagram.", "facebook.", "fb.", "fb.me", "t.co", "twitter.", "x.com", "tiktok.", "whatsapp.", "wa.me",
  "youtube.", "youtu.be", "linkedin.", "pinterest.", "threads.", "reddit.", "l.instagram", "lm.facebook",
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Clasifica el origen del tráfico a partir de UTM y referrer. */
export function classifySource(input: {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  siteHost?: string | null;
}): TrafficSource {
  const medium = input.utmMedium?.toLowerCase() ?? "";
  const utmSource = input.utmSource?.toLowerCase() ?? "";
  if (["cpc", "ppc", "paid", "paidsocial", "paid_social", "ads", "display"].includes(medium)) return "ads";
  if (medium === "email" || medium === "newsletter") return "email";
  if (medium === "social" || SOCIAL.some((s) => utmSource.startsWith(s.replace(/\.$/, "")))) return "social";
  if (medium === "organic") return "search";

  const host = hostOf(input.referrer);
  const site = input.siteHost?.toLowerCase().replace(/^www\./, "") ?? null;
  if (!host || (site && host === site)) return utmSource ? "referral" : "direct";
  if (SEARCH.some((s) => host.includes(s))) return "search";
  if (SOCIAL.some((s) => host === s.replace(/\.$/, "") || host.startsWith(s) || host.includes("." + s))) return "social";
  if (host.includes("mail.")) return "email";
  return "referral";
}
