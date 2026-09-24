import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Address } from "@/lib/types";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { deleteAddress, setDefaultAddress } from "../actions";
import { AddressEditor } from "./address-editor";

export const metadata: Metadata = { title: "Direcciones" };

export default async function AddressesPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at");
  const addresses = (data ?? []) as Address[];

  return (
    <div className="space-y-6">
      <PageTitle>Direcciones</PageTitle>
      {addresses.length === 0 && <EmptyState>No tenés direcciones guardadas.</EmptyState>}
      <div className="grid gap-4 sm:grid-cols-2">
        {addresses.map((a) => (
          <Card key={a.id} title={<>{a.label || "Dirección"} {a.is_default && <Badge tone="green">Principal</Badge>}</>}>
            <p className="text-sm">
              {a.recipient}<br />{a.street} {a.number}{a.apartment ? `, ${a.apartment}` : ""}<br />
              {a.city}, {a.province} ({a.postal_code})
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase">
              <AddressEditor address={a} />
              {!a.is_default && (
                <form action={setDefaultAddress}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="underline">Hacer principal</button>
                </form>
              )}
              <form action={deleteAddress}>
                <input type="hidden" name="id" value={a.id} />
                <button className="text-red-600 underline">Eliminar</button>
              </form>
            </div>
          </Card>
        ))}
      </div>
      <Card title="Agregar dirección"><AddressEditor /></Card>
    </div>
  );
}
