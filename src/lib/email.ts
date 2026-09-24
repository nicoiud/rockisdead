import "server-only";

interface EmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/** Envía un email con Resend. Sin API key, lo registra en consola (modo desarrollo). */
export async function sendEmail({ to, subject, html, replyTo }: EmailInput): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Rock Is Dead <onboarding@resend.dev>";
  if (!key) {
    console.info(`[email] (sin RESEND_API_KEY) Para: ${to} | ${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      console.error(`[email] Error ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] Error", e);
    return false;
  }
}

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plantilla base de emails (diseño simple, se puede personalizar después). */
export function emailLayout(storeName: string, title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e5e5e5">
<tr><td style="background:#000;color:#fff;padding:20px 24px;font-size:20px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${escapeHtml(storeName)}</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#000;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>`;
}
