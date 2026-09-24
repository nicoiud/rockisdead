import { NextResponse, type NextRequest } from "next/server";
import { sendWeeklyReport } from "@/lib/notifications";

/** Reporte semanal (Vercel Cron, ver vercel.json). Protegido con CRON_SECRET. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendWeeklyReport();
  return NextResponse.json(result);
}
