"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { placeOrder } from "./actions";
import { formatMoney } from "@/lib/format";
import type { Address, ShippingMethod } from "@/lib/types";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

const PROVINCES = [
  "CABA", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy",
  "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz",
  "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

interface Line { id: string; name: string; variant: string; quantity: number; price: number; image: string | null }

export function CheckoutForm({
  lines,
  subtotal,
  shippingMethods,
  addresses,
  profile,
  payment,
}: {
  lines: Line[];
  subtotal: number;
  shippingMethods: ShippingMethod[];
  addresses: Address[];
  profile: { email: string; full_name: string | null; phone: string | null; document: string | null } | null;
  payment: { mp: boolean; transfer: boolean; transferDiscount: number };
}) {
  const [state, action] = useActionState(placeOrder, null);
  const [shippingId, setShippingId] = useState(shippingMethods[0]?.id ?? "");
  const [method, setMethod] = useState<"mercado_pago" | "transfer">(payment.mp ? "mercado_pago" : "transfer");
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");

  const shipping = shippingMethods.find((m) => m.id === shippingId);
  const shippingCost = !shipping ? 0 : shipping.free_over !== null && subtotal >= Number(shipping.free_over) ? 0 : Number(shipping.price);
  const discount = method === "transfer" && payment.transferDiscount > 0 ? Math.round(subtotal * payment.transferDiscount) / 100 : 0;
  const total = subtotal - discount + shippingCost;

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase">1. Tus datos</h2>
          {!profile && (
            <p className="text-sm text-neutral-600">
              ¿Ya tenés cuenta? <Link href="/login?next=/checkout" className="font-bold underline">Ingresá</Link> para ver tus pedidos después.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input name="email" type="email" required defaultValue={profile?.email} readOnly={!!profile} />
            </Field>
            <Field label="Nombre y apellido">
              <Input name="customer_name" required defaultValue={profile?.full_name ?? ""} />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <Input name="phone" type="tel" required defaultValue={profile?.phone ?? ""} />
            </Field>
            <Field label="DNI / CUIT (opcional)">
              <Input name="document" defaultValue={profile?.document ?? ""} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase">2. Envío</h2>
          <div className="space-y-2">
            {shippingMethods.map((m) => {
              const free = m.free_over !== null && subtotal >= Number(m.free_over);
              return (
                <label key={m.id} className={`flex cursor-pointer items-start gap-3 border p-3 ${shippingId === m.id ? "border-black" : "border-neutral-300"}`}>
                  <input type="radio" name="shipping_method_id" value={m.id} checked={shippingId === m.id} onChange={() => setShippingId(m.id)} className="mt-1 accent-black" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{m.name}</span>
                    {m.description && <span className="block text-xs text-neutral-500">{m.description}</span>}
                    {m.free_over !== null && !free && (
                      <span className="block text-xs text-neutral-500">Gratis desde {formatMoney(m.free_over)}</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold">{free || Number(m.price) === 0 ? "Gratis" : formatMoney(m.price)}</span>
                </label>
              );
            })}
          </div>

          {shipping?.requires_address && (
            <div className="space-y-4">
              {addresses.length > 0 && (
                <Field label="Dirección">
                  <Select name="address_id" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label ? `${a.label}: ` : ""}{a.street} {a.number}, {a.city}
                      </option>
                    ))}
                    <option value="">+ Nueva dirección</option>
                  </Select>
                </Field>
              )}
              {!addressId && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Quién recibe" className="sm:col-span-2">
                    <Input name="recipient" defaultValue={profile?.full_name ?? ""} />
                  </Field>
                  <Field label="Calle"><Input name="street" required /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Altura"><Input name="number" required /></Field>
                    <Field label="Piso / Depto"><Input name="apartment" /></Field>
                  </div>
                  <Field label="Localidad"><Input name="city" required /></Field>
                  <Field label="Provincia">
                    <Select name="province" required defaultValue="">
                      <option value="" disabled>Elegí</option>
                      {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                    </Select>
                  </Field>
                  <Field label="Código postal"><Input name="postal_code" required /></Field>
                  <Field label="Teléfono de contacto"><Input name="address_phone" type="tel" /></Field>
                  <Field label="Indicaciones" className="sm:col-span-2"><Input name="address_notes" placeholder="Entre calles, timbre, horario…" /></Field>
                  {profile && (
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" name="save_address" value="1" defaultChecked className="accent-black" /> Guardar esta dirección
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase">3. Pago</h2>
          <div className="space-y-2">
            {payment.mp && (
              <label className={`flex cursor-pointer items-start gap-3 border p-3 ${method === "mercado_pago" ? "border-black" : "border-neutral-300"}`}>
                <input type="radio" name="payment_method" value="mercado_pago" checked={method === "mercado_pago"} onChange={() => setMethod("mercado_pago")} className="mt-1 accent-black" />
                <span>
                  <span className="block text-sm font-semibold">Mercado Pago</span>
                  <span className="block text-xs text-neutral-500">Tarjetas de crédito, débito, dinero en cuenta. Te redirigimos para pagar.</span>
                </span>
              </label>
            )}
            {payment.transfer && (
              <label className={`flex cursor-pointer items-start gap-3 border p-3 ${method === "transfer" ? "border-black" : "border-neutral-300"}`}>
                <input type="radio" name="payment_method" value="transfer" checked={method === "transfer"} onChange={() => setMethod("transfer")} className="mt-1 accent-black" />
                <span>
                  <span className="block text-sm font-semibold">
                    Transferencia bancaria{payment.transferDiscount > 0 && ` (${payment.transferDiscount}% OFF)`}
                  </span>
                  <span className="block text-xs text-neutral-500">Te mostramos los datos bancarios y subís el comprobante.</span>
                </span>
              </label>
            )}
          </div>
          <Field label="Notas del pedido (opcional)">
            <Textarea name="notes" rows={2} />
          </Field>
        </section>
      </div>

      <aside className="h-fit space-y-4 border border-neutral-200 p-4 lg:sticky lg:top-4">
        <h2 className="text-sm font-black uppercase">Resumen</h2>
        <ul className="space-y-3">
          {lines.map((l) => (
            <li key={l.id} className="flex gap-3 text-sm">
              <div className="h-16 w-12 shrink-0 bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.image && <img src={l.image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{l.name}</p>
                <p className="text-neutral-500">{l.variant} × {l.quantity}</p>
              </div>
              <p>{formatMoney(l.price * l.quantity)}</p>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
          {discount > 0 && <div className="flex justify-between text-green-700"><dt>Descuento transferencia</dt><dd>-{formatMoney(discount)}</dd></div>}
          <div className="flex justify-between"><dt>Envío</dt><dd>{shippingCost ? formatMoney(shippingCost) : "Gratis"}</dd></div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg font-bold"><dt>Total</dt><dd>{formatMoney(total)}</dd></div>
        </dl>
        <FormMessage state={state} />
        <SubmitButton className="w-full py-3" pendingText="Procesando…" disabled={!shippingMethods.length || (!payment.mp && !payment.transfer)}>
          {method === "mercado_pago" ? "Pagar con Mercado Pago" : "Confirmar pedido"}
        </SubmitButton>
      </aside>
    </form>
  );
}
