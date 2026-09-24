import Link from "next/link";
import { getCategories } from "@/lib/catalog";
import { getCart } from "@/lib/cart";
import { getProfile, isStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export async function StoreHeader() {
  const [settings, categories, cart, profile] = await Promise.all([getSettings(), getCategories(), getCart(), getProfile()]);
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4">
        <Link href="/" className="text-xl font-black uppercase tracking-widest">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt={settings.store_name} className="h-10 w-auto" />
          ) : (
            settings.store_name
          )}
        </Link>
        <form action="/productos" className="order-3 w-full sm:order-none sm:ml-6 sm:w-auto sm:flex-1">
          <input
            name="q"
            placeholder="Buscar…"
            className="w-full border border-neutral-300 px-3 py-2 text-sm focus:border-black focus:outline-none sm:max-w-xs"
          />
        </form>
        <nav className="ml-auto flex items-center gap-4 text-sm font-semibold uppercase">
          {isStaff(profile) && <Link href="/admin">Admin</Link>}
          <Link href={profile ? "/cuenta" : "/login"}>{profile ? "Mi cuenta" : "Ingresar"}</Link>
          <Link href="/carrito" className="relative">
            Carrito
            {cart.count > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-xs text-white">
                {cart.count}
              </span>
            )}
          </Link>
        </nav>
      </div>
      <nav className="border-t border-neutral-100">
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-2 text-xs font-semibold uppercase tracking-wide">
          <Link href="/productos" className="shrink-0 hover:underline">Todo</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/productos?categoria=${c.slug}`} className="shrink-0 hover:underline">
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
