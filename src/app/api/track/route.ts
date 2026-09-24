import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isStaff } from "@/lib/auth";
import { classifySource } from "@/lib/analytics";

const VISITOR_COOKIE = "rid_vid";
const BOT = /bot|crawler|spider|crawling|preview|facebookexternalhit|whatsapp|slurp|lighthouse|headless/i;

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const path = typeof body.path === "string" ? body.path.slice(0, 300) : null;
  // No registrar admin, cuenta, checkout interno ni APIs
  if (!path || !path.startsWith("/") || /^\/(admin|api|auth)(\/|$)/.test(path)) {
    return new NextResponse(null, { status: 204 });
  }

  const profile = await getProfile();
  if (isStaff(profile)) return new NextResponse(null, { status: 204 }); // el staff no suma visitas

  const s = (k: string) => (typeof body[k] === "string" && body[k] ? String(body[k]).slice(0, 300) : null);
  const referrer = s("referrer");
  const source = classifySource({
    referrer,
    utmSource: s("utm_source"),
    utmMedium: s("utm_medium"),
    siteHost: request.nextUrl.hostname,
  });

  const db = createAdminClient();
  let productId: string | null = null;
  const m = path.match(/^\/productos\/([^/?#]+)/);
  if (m) {
    const { data } = await db.from("products").select("id").eq("slug", decodeURIComponent(m[1])).maybeSingle();
    productId = data?.id ?? null;
  }

  let visitorId = request.cookies.get(VISITOR_COOKIE)?.value;
  const isNew = !visitorId;
  if (!visitorId) visitorId = randomUUID();

  await db.from("page_views").insert({
    path,
    product_id: productId,
    user_id: profile?.id ?? null,
    visitor_id: visitorId,
    referrer: referrer && !referrer.includes(request.nextUrl.hostname) ? referrer : null,
    source,
    utm_source: s("utm_source"),
    utm_medium: s("utm_medium"),
    utm_campaign: s("utm_campaign"),
  });

  const res = new NextResponse(null, { status: 204 });
  if (isNew) {
    res.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}
