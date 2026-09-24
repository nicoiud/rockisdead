import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminNav, type NavItem } from "@/components/admin/nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireStaff();
  const { count: pending } = await createAdminClient()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending_transfer", "pending_payment"]);

  const items: NavItem[] = [{ href: "/admin", label: "Dashboard" }];
  if (hasPermission(profile, "orders")) items.push({ href: "/admin/pedidos", label: "Pedidos", badge: pending ?? 0 });
  if (hasPermission(profile, "products")) {
    items.push(
      { href: "/admin/productos", label: "Productos" },
      { href: "/admin/categorias", label: "Categorías" },
      { href: "/admin/stock", label: "Stock" },
    );
  }
  if (hasPermission(profile, "reports")) items.push({ href: "/admin/reportes", label: "Ventas" });
  if (hasPermission(profile, "analytics")) items.push({ href: "/admin/visitas", label: "Visitas" });
  if (hasPermission(profile, "users")) items.push({ href: "/admin/usuarios", label: "Usuarios" });
  if (hasPermission(profile, "settings")) items.push({ href: "/admin/configuracion", label: "Configuración" });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 md:flex-row">
      <aside className="bg-black p-3 text-white md:w-56 md:shrink-0">
        <Link href="/admin" className="mb-4 block px-3 py-2 text-lg font-black uppercase tracking-widest">RID Admin</Link>
        <AdminNav items={items} />
        <div className="mt-6 space-y-1 border-t border-neutral-800 px-3 pt-4 text-xs text-neutral-400">
          <p className="truncate">{profile.email}</p>
          <Link href="/" className="block hover:text-white">Ver tienda →</Link>
          <form action="/auth/salir" method="post">
            <button className="hover:text-white">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
