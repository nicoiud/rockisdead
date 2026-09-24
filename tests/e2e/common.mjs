import { chromium } from "playwright";
import pg from "pg";

// Valores por defecto de `supabase start` (CLI) y `npm run dev`
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const db = new pg.Client({ connectionString: process.env.E2E_DB_URL ?? "postgres://postgres:postgres@localhost:54322/postgres" });

export async function launch() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  });
  // User-agent normal: el tracking de visitas descarta navegadores headless (bots)
  const orig = browser.newPage.bind(browser);
  browser.newPage = () =>
    orig({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  return browser;
}

export function watch(page, errors) {
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools|localhost:4010/.test(m.text() + page.url())) errors.push(`console ${page.url()}: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
}

export function ok(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("  ✓", msg);
}
