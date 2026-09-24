import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function AccountLayout({ children }: LayoutProps<"/cuenta">) {
  const profile = await requireUser();
  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-4">
        <div>
          <p className="text-xs uppercase text-neutral-500">Hola</p>
          <p className="font-bold">{profile.full_name ?? profile.email}</p>
        </div>
        <nav className="flex flex-col gap-2 text-sm font-semibold uppercase">
          <Link href="/cuenta" className="hover:underline">Mis datos</Link>
          <Link href="/cuenta/pedidos" className="hover:underline">Mis pedidos</Link>
          <Link href="/cuenta/direcciones" className="hover:underline">Direcciones</Link>
          <form action="/auth/salir" method="post">
            <button type="submit" className="uppercase text-red-600 hover:underline">Cerrar sesión</button>
          </form>
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
