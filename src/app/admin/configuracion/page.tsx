import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import type { ShippingMethod } from "@/lib/types";
import { Card, PageTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/form";
import { BannersEditor, NotificationsForm, PaymentsForm, ShippingForm, StoreForm } from "./forms";
import { deleteShipping } from "./actions";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  await requireStaff("settings");
  const db = createAdminClient();
  const [settings, { data: priv }, { data: methods }] = await Promise.all([
    getSettings(),
    db.from("private_settings").select("mp_access_token, mp_webhook_secret").eq("id", 1).single(),
    db.from("shipping_methods").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle>Configuración</PageTitle>
      <Card title="Datos de la tienda"><StoreForm s={settings} /></Card>
      <Card title="Medios de pago">
        <PaymentsForm
          s={settings}
          hasToken={!!(priv?.mp_access_token || process.env.MP_ACCESS_TOKEN)}
          hasSecret={!!(priv?.mp_webhook_secret || process.env.MP_WEBHOOK_SECRET)}
          webhookUrl={`${siteUrl()}/api/webhooks/mercadopago`}
        />
      </Card>
      <Card title="Métodos de envío">
        <div className="space-y-6 divide-y divide-neutral-200">
          {((methods ?? []) as ShippingMethod[]).map((m) => (
            <div key={m.id} className="space-y-2 pt-4 first:pt-0">
              <ShippingForm method={m} />
              <form action={deleteShipping}>
                <input type="hidden" name="id" value={m.id} />
                <ConfirmButton variant="ghost" className="text-red-600" message={`¿Eliminar "${m.name}"?`}>Eliminar</ConfirmButton>
              </form>
            </div>
          ))}
          <div className="pt-4">
            <p className="mb-2 text-xs font-black uppercase">Nuevo método</p>
            <ShippingForm />
          </div>
        </div>
      </Card>
      <Card title="Notificaciones y alertas"><NotificationsForm s={settings} /></Card>
      <Card title="Banners de la home"><BannersEditor initial={settings.banners ?? []} /></Card>
    </div>
  );
}
