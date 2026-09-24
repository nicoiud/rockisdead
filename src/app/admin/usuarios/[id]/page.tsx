import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatMoney, whatsappLink } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, SALE_STATUSES } from "@/lib/labels";
import type { Address, Order, Profile } from "@/lib/types";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { OrderStatusBadge } from "@/components/orders/order-summary";
import { Stat } from "@/components/admin/stat";
import { ActiveForm, RoleForm } from "../forms";

export const metadata: Metadata = { title: "Usuario" };

export default async function UserPage(props: PageProps<"/admin/usuarios/[id]">) {
  await requireStaff("users");
  const me = await getProfile();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const { data: user } = await db.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!user) notFound();
  const [{ data: orders }, { data: addresses }] = await Promise.all([
    db.from("orders").select("*").or(`user_id.eq.${id},email.eq."${user.email}"`).order("created_at", { ascending: false }),
    db.from("addresses").select("*").eq("user_id", id),
  ]);
  const list = (orders ?? []) as Order[];
  const paid = list.filter((o) => SALE_STATUSES.includes(o.status));
  const spent = paid.reduce((s, o) => s + Number(o.total), 0);
  const wa = whatsappLink(user.phone, `Hola ${user.full_name ?? ""}!`);

  return (
    <div className="space-y-6">
      <PageTitle actions={<Link href="/admin/usuarios" className="text-sm underline">← Usuarios</Link>}>{user.full_name || user.email}</PageTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pedidos pagados" value={String(paid.length)} hint={`${list.length} en total`} />
        <Stat label="Total gastado" value={formatMoney(spent)} />
        <Stat label="Ticket promedio" value={formatMoney(paid.length ? spent / paid.length : 0)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="Historial de pedidos">
          {list.length === 0 ? <EmptyState>Sin pedidos.</EmptyState> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr><th className="p-2">#</th><th className="p-2">Fecha</th><th className="p-2">Pago</th><th className="p-2">Estado</th><th className="p-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {list.map((o) => (
                  <tr key={o.id}>
                    <td className="p-2"><Link href={`/admin/pedidos/${o.id}`} className="font-bold underline">#{o.number}</Link></td>
                    <td className="p-2">{formatDate(o.created_at, true)}</td>
                    <td className="p-2">{PAYMENT_METHOD_LABEL[o.payment_method]}</td>
                    <td className="p-2"><OrderStatusBadge status={o.status} /></td>
                    <td className="p-2 text-right">{formatMoney(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Datos">
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-neutral-500">Email: </dt><dd className="inline">{user.email}</dd></div>
              <div><dt className="inline text-neutral-500">Teléfono: </dt><dd className="inline">{user.phone ?? "—"}</dd></div>
              <div><dt className="inline text-neutral-500">DNI/CUIT: </dt><dd className="inline">{user.document ?? "—"}</dd></div>
              <div><dt className="inline text-neutral-500">Alta: </dt><dd className="inline">{formatDate(user.created_at)}</dd></div>
            </dl>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-3 inline-block bg-green-600 px-3 py-1 text-xs font-bold uppercase text-white">WhatsApp</a>}
            <div className="mt-4 border-t border-neutral-200 pt-4"><ActiveForm id={user.id} active={user.active} /></div>
          </Card>
          {(addresses ?? []).length > 0 && (
            <Card title="Direcciones">
              <ul className="space-y-2 text-sm">
                {((addresses ?? []) as Address[]).map((a) => (
                  <li key={a.id}>{a.street} {a.number}{a.apartment ? `, ${a.apartment}` : ""} — {a.city}, {a.province} ({a.postal_code})</li>
                ))}
              </ul>
            </Card>
          )}
          {me?.role === "admin" && (
            <Card title="Rol y permisos"><RoleForm id={user.id} role={user.role} permissions={user.permissions} /></Card>
          )}
        </div>
      </div>
    </div>
  );
}
