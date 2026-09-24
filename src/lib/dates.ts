import { TZ } from "./format";

// Argentina no tiene horario de verano: UTC-3 fijo.
const OFFSET = "-03:00";

export type Bucket = "day" | "week" | "month";
export type RangePreset = "today" | "7d" | "30d" | "90d" | "week" | "month" | "last_month" | "year" | "custom";

export const RANGE_LABEL: Record<RangePreset, string> = {
  today: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  week: "Esta semana",
  month: "Este mes",
  last_month: "Mes anterior",
  year: "Este año",
  custom: "Personalizado",
};

/** Fecha YYYY-MM-DD en horario argentino. */
export function ymdAR(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function startOfDayAR(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${OFFSET}`);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DateRange {
  preset: RangePreset;
  from: Date; // inclusive
  to: Date; // exclusive
  fromYmd: string;
  toYmd: string; // inclusive (para mostrar)
  bucket: Bucket;
  prevFrom: Date;
  prevTo: Date;
}

const isYmd = (s: string | undefined | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function resolveRange(
  preset: string | undefined,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): DateRange {
  const today = ymdAR(now);
  let p = (preset as RangePreset) ?? "30d";
  let fromYmd: string;
  let toYmd = today;

  switch (p) {
    case "today":
      fromYmd = today;
      break;
    case "7d":
      fromYmd = addDays(today, -6);
      break;
    case "90d":
      fromYmd = addDays(today, -89);
      break;
    case "week": {
      const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
      fromYmd = addDays(today, -((dow + 6) % 7)); // lunes
      break;
    }
    case "month":
      fromYmd = today.slice(0, 8) + "01";
      break;
    case "last_month": {
      const firstThis = today.slice(0, 8) + "01";
      toYmd = addDays(firstThis, -1);
      fromYmd = toYmd.slice(0, 8) + "01";
      break;
    }
    case "year":
      fromYmd = today.slice(0, 5) + "01-01";
      break;
    case "custom":
      if (isYmd(customFrom) && isYmd(customTo) && customFrom <= customTo) {
        fromYmd = customFrom;
        toYmd = customTo;
      } else {
        p = "30d";
        fromYmd = addDays(today, -29);
      }
      break;
    default:
      p = "30d";
      fromYmd = addDays(today, -29);
  }

  const from = startOfDayAR(fromYmd);
  const to = startOfDayAR(addDays(toYmd, 1));
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const bucket: Bucket = days <= 62 ? "day" : days <= 200 ? "week" : "month";
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

  return { preset: p, from, to, fromYmd, toYmd, bucket, prevFrom, prevTo };
}

/** Lista de buckets del rango (para completar con ceros en los gráficos). */
export function bucketKeys(range: Pick<DateRange, "fromYmd" | "toYmd" | "bucket">): string[] {
  const keys: string[] = [];
  let cur = range.fromYmd;
  if (range.bucket === "week") {
    const dow = new Date(`${cur}T12:00:00Z`).getUTCDay();
    cur = addDays(cur, -((dow + 6) % 7));
  } else if (range.bucket === "month") {
    cur = cur.slice(0, 8) + "01";
  }
  while (cur <= range.toYmd) {
    keys.push(cur);
    if (range.bucket === "day") cur = addDays(cur, 1);
    else if (range.bucket === "week") cur = addDays(cur, 7);
    else {
      const [y, m] = cur.split("-").map(Number);
      cur = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  return keys;
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}
