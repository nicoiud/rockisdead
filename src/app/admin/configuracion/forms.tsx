"use client";

import { useActionState, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Banner, ShippingMethod, StoreSettings } from "@/lib/types";
import { Alert, Button, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { saveBanners, saveNotifications, savePayments, saveShipping, saveStore, testWeeklyReport } from "./actions";

async function uploadStoreImage(file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("store").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("store").getPublicUrl(path).data.publicUrl;
}

function ImageInput({ name, defaultValue, label }: { name: string; defaultValue: string | null; label: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" className="h-12 w-auto border border-neutral-200" />}
        <Input name={name} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" />
        <label className="shrink-0 cursor-pointer border border-black px-3 py-2 text-xs font-semibold uppercase">
          {busy ? "Subiendo…" : "Subir"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setErr(null);
              try {
                setUrl(await uploadStoreImage(f));
              } catch (x) {
                setErr((x as Error).message);
              }
              setBusy(false);
            }}
          />
        </label>
      </div>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </Field>
  );
}

export function StoreForm({ s }: { s: StoreSettings }) {
  const [state, action] = useActionState(saveStore, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre de la tienda"><Input name="store_name" defaultValue={s.store_name} required /></Field>
      <ImageInput name="logo_url" defaultValue={s.logo_url} label="Logo" />
      <Field label="Email de contacto"><Input name="contact_email" type="email" defaultValue={s.contact_email ?? ""} /></Field>
      <Field label="Teléfono"><Input name="contact_phone" defaultValue={s.contact_phone ?? ""} /></Field>
      <Field label="WhatsApp" hint="Con código de país, ej. 5491122334455"><Input name="whatsapp" defaultValue={s.whatsapp ?? ""} /></Field>
      <Field label="Instagram (usuario)"><Input name="instagram" defaultValue={s.instagram ?? ""} /></Field>
      <Field label="Dirección / local" className="sm:col-span-2"><Input name="address" defaultValue={s.address ?? ""} /></Field>
      <div className="space-y-2 sm:col-span-2"><FormMessage state={state} /><SubmitButton>Guardar</SubmitButton></div>
    </form>
  );
}

export function PaymentsForm({ s, hasToken, hasSecret, webhookUrl }: { s: StoreSettings; hasToken: boolean; hasSecret: boolean; webhookUrl: string }) {
  const [state, action] = useActionState(savePayments, null);
  return (
    <form action={action} className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase">Mercado Pago</h3>
        <Checkbox name="mp_enabled" value="1" defaultChecked={s.mp_enabled} label="Habilitar Mercado Pago" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Public key"><Input name="mp_public_key" defaultValue={s.mp_public_key ?? ""} /></Field>
          <Field label="Access token" hint={hasToken ? "Configurado. Dejá vacío para no cambiarlo (\"-\" para borrarlo)." : "No configurado"}>
            <Input name="mp_access_token" type="password" autoComplete="off" placeholder={hasToken ? "••••••••" : "APP_USR-…"} />
          </Field>
          <Field label="Clave secreta del webhook" hint={hasSecret ? "Configurada. Valida la firma de las notificaciones." : "Opcional pero recomendada"}>
            <Input name="mp_webhook_secret" type="password" autoComplete="off" placeholder={hasSecret ? "••••••••" : ""} />
          </Field>
          <Field label="URL del webhook (cargar en Mercado Pago)"><Input value={webhookUrl} readOnly /></Field>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase">Transferencia bancaria</h3>
        <Checkbox name="transfer_enabled" value="1" defaultChecked={s.transfer_enabled} label="Habilitar transferencia" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titular"><Input name="bank_holder" defaultValue={s.bank_holder ?? ""} /></Field>
          <Field label="Banco"><Input name="bank_name" defaultValue={s.bank_name ?? ""} /></Field>
          <Field label="CBU / CVU"><Input name="bank_cbu" defaultValue={s.bank_cbu ?? ""} /></Field>
          <Field label="Alias"><Input name="bank_alias" defaultValue={s.bank_alias ?? ""} /></Field>
          <Field label="CUIT"><Input name="bank_cuit" defaultValue={s.bank_cuit ?? ""} /></Field>
          <Field label="Descuento por transferencia (%)"><Input name="transfer_discount_pct" type="number" min={0} max={99} step="0.5" defaultValue={s.transfer_discount_pct} /></Field>
          <Field label="Instrucciones" className="sm:col-span-2"><Textarea name="transfer_instructions" rows={2} defaultValue={s.transfer_instructions ?? ""} /></Field>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Guardar pagos</SubmitButton>
    </form>
  );
}

export function NotificationsForm({ s }: { s: StoreSettings }) {
  const [state, action] = useActionState(saveNotifications, null);
  const [testState, setTestState] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form action={action} className="space-y-4">
      <Checkbox name="notify_email" value="1" defaultChecked={s.notify_email} label="Enviar emails al admin (pedido nuevo, comprobante, stock bajo, reporte semanal)" />
      <Checkbox name="notify_whatsapp" value="1" defaultChecked={s.notify_whatsapp} label="Mostrar botón de WhatsApp en la tienda y links de WhatsApp en avisos" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email del admin para avisos"><Input name="admin_email" type="email" defaultValue={s.admin_email ?? ""} /></Field>
        <Field label="Umbral de stock bajo" hint="Alerta cuando una variante queda con este stock o menos"><Input name="low_stock_threshold" type="number" min={0} defaultValue={s.low_stock_threshold} /></Field>
      </div>
      <p className="text-xs text-neutral-500">Los emails a clientes (confirmación y cambios de estado) se envían siempre. Requiere RESEND_API_KEY.</p>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Guardar</SubmitButton>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => setTestState(await testWeeklyReport()))}>
          Enviar reporte semanal ahora
        </Button>
      </div>
      <FormMessage state={testState} />
    </form>
  );
}

export function BannersEditor({ initial }: { initial: Banner[] }) {
  const [banners, setBanners] = useState<Banner[]>(initial);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Banner>) => setBanners((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-4">
      {banners.map((b, i) => (
        <div key={i} className="grid gap-3 border border-neutral-200 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={`Imagen banner ${i + 1}`}>
              <div className="flex items-center gap-2">
                <Input value={b.image} onChange={(e) => update(i, { image: e.target.value })} placeholder="URL de la imagen" />
                <label className="shrink-0 cursor-pointer border border-black px-3 py-2 text-xs font-semibold uppercase">
                  Subir
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) update(i, { image: await uploadStoreImage(f) });
                  }} />
                </label>
              </div>
            </Field>
          </div>
          <Field label="Título"><Input value={b.title ?? ""} onChange={(e) => update(i, { title: e.target.value })} /></Field>
          <Field label="Subtítulo"><Input value={b.subtitle ?? ""} onChange={(e) => update(i, { subtitle: e.target.value })} /></Field>
          <Field label="Link"><Input value={b.link ?? ""} onChange={(e) => update(i, { link: e.target.value })} placeholder="/productos?categoria=remeras" /></Field>
          <div className="flex items-end"><Button type="button" variant="ghost" className="text-red-600" onClick={() => setBanners((x) => x.filter((_, j) => j !== i))}>Quitar</Button></div>
        </div>
      ))}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => setBanners((b) => [...b, { image: "", title: "", subtitle: "", link: "/productos" }])}>+ Agregar banner</Button>
        <Button type="button" disabled={pending} onClick={() => start(async () => setMsg(await saveBanners(banners)))}>Guardar banners</Button>
      </div>
      {msg?.error && <Alert tone="error">{msg.error}</Alert>}
      {msg?.ok && <Alert tone="success">{msg.message}</Alert>}
    </div>
  );
}

export function ShippingForm({ method }: { method?: ShippingMethod }) {
  const [state, action] = useActionState(saveShipping, null);
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-6">
      <input type="hidden" name="id" value={method?.id ?? ""} />
      <Field label="Nombre" className="sm:col-span-2"><Input name="name" defaultValue={method?.name} required /></Field>
      <Field label="Costo $"><Input name="price" type="number" min={0} step="any" defaultValue={method?.price ?? 0} required /></Field>
      <Field label="Gratis desde $"><Input name="free_over" type="number" min={0} step="any" defaultValue={method?.free_over ?? ""} /></Field>
      <Field label="Orden"><Input name="sort_order" type="number" defaultValue={method?.sort_order ?? 0} /></Field>
      <div className="space-y-1 pb-1">
        <Checkbox name="requires_address" value="1" defaultChecked={method?.requires_address ?? true} label="Pide dirección" />
        <Checkbox name="active" value="1" defaultChecked={method?.active ?? true} label="Activo" />
      </div>
      <Field label="Descripción" className="sm:col-span-5"><Input name="description" defaultValue={method?.description ?? ""} /></Field>
      <SubmitButton>{method ? "Guardar" : "Agregar"}</SubmitButton>
      <div className="sm:col-span-6"><FormMessage state={state} /></div>
    </form>
  );
}
