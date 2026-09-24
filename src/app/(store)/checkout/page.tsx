import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCart } from "@/lib/cart";
import { getProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Address, ShippingMethod } from "@/lib/types";
import { PageTitle } from "@/components/ui";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [cart, profile, settings] = await Promise.all([getCart(), getProfile(), getSettings()]);
  if (!cart.lines.length || cart.hasIssues) redirect("/carrito");

  const db = createAdminClient();
  const [{ data: methods }, { data: addresses }] = await Promise.all([
    db.from("shipping_methods").select("*").eq("active", true).order("sort_order"),
    profile
      ? db.from("addresses").select("*").eq("user_id", profile.id).order("is_default", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div>
      <PageTitle>Finalizar compra</PageTitle>
      <CheckoutForm
        lines={cart.lines.map((l) => ({
          id: l.id,
          name: l.product_name,
          variant: l.variant_title,
          quantity: l.quantity,
          price: l.unit_price,
          image: l.image_url,
        }))}
        subtotal={cart.subtotal}
        shippingMethods={(methods ?? []) as ShippingMethod[]}
        addresses={(addresses ?? []) as Address[]}
        profile={profile ? { email: profile.email, full_name: profile.full_name, phone: profile.phone, document: profile.document } : null}
        payment={{
          mp: settings.mp_enabled,
          transfer: settings.transfer_enabled,
          transferDiscount: Number(settings.transfer_discount_pct),
        }}
      />
    </div>
  );
}
