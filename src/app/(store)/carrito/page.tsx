import type { Metadata } from "next";
import Link from "next/link";
import { getCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { Alert, ButtonLink, EmptyState, PageTitle } from "@/components/ui";
import { removeCartItem, updateCartItem } from "./actions";

export const metadata: Metadata = { title: "Carrito" };

export default async function CartPage() {
  const cart = await getCart();

  if (!cart.lines.length) {
    return (
      <div>
        <PageTitle>Carrito</PageTitle>
        <EmptyState>
          Tu carrito está vacío. <Link href="/productos" className="font-bold underline">Ver productos</Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageTitle>Carrito</PageTitle>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex gap-4 py-4">
              <Link href={`/productos/${line.product_slug}`} className="h-28 w-20 shrink-0 bg-neutral-100">
                {line.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={line.image_url} alt={line.product_name} className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex justify-between gap-4">
                  <div>
                    <Link href={`/productos/${line.product_slug}`} className="font-semibold uppercase">{line.product_name}</Link>
                    {line.variant_title && <p className="text-sm text-neutral-500">{line.variant_title}</p>}
                    <p className="text-sm">{formatMoney(line.unit_price)}</p>
                  </div>
                  <p className="font-semibold">{formatMoney(line.unit_price * line.quantity)}</p>
                </div>
                {line.issue && <p className="text-sm font-semibold text-red-600">{line.issue}</p>}
                <div className="flex items-center gap-3">
                  <form action={updateCartItem} className="flex items-center gap-2">
                    <input type="hidden" name="item_id" value={line.id} />
                    <input
                      type="number"
                      name="quantity"
                      min={0}
                      max={Math.max(line.stock, line.quantity)}
                      defaultValue={line.quantity}
                      className="w-16 border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <button type="submit" className="text-xs uppercase underline">Actualizar</button>
                  </form>
                  <form action={removeCartItem}>
                    <input type="hidden" name="item_id" value={line.id} />
                    <button type="submit" className="text-xs uppercase text-red-600 underline">Eliminar</button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <aside className="h-fit space-y-4 border border-neutral-200 p-4">
          <div className="flex justify-between text-lg font-bold">
            <span>Subtotal</span>
            <span>{formatMoney(cart.subtotal)}</span>
          </div>
          <p className="text-xs text-neutral-500">El envío y los descuentos se calculan en el checkout.</p>
          {cart.hasIssues && <Alert tone="warning">Revisá los productos marcados antes de continuar.</Alert>}
          {cart.hasIssues ? (
            <span className="block bg-neutral-300 py-3 text-center text-sm font-medium uppercase text-white">Continuar compra</span>
          ) : (
            <ButtonLink href="/checkout" className="w-full py-3">Continuar compra</ButtonLink>
          )}
          <Link href="/productos" className="block text-center text-xs underline">Seguir comprando</Link>
        </aside>
      </div>
    </div>
  );
}
