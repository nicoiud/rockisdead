import type { Metadata } from "next";
import Link from "next/link";
import { getProfile, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfDayAR } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";
import { PERMISSION_LABEL } from "@/lib/labels";
import type { Permission, UserRole } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select } from "@/components/ui";
import { AddStaffForm } from "./forms";

export const metadata: Metadata = { title: "Usuarios" };

type CustomerRow = {
  id: string; email: string; full_name: string | null; phone: string | null; role: UserRole; active: boolean;
  created_at: string; orders_count: number; total_spent: number; last_order_at: string | null;
};

export default async function UsersPage(props: PageProps<"/admin/usuarios">) {
  await requireStaff("users");
  const me = await getProfile();
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const page = Number(s("pagina") ?? 1) || 1;
  const perPage = 50;
  const db = createAdminClient();

  let q = db.from("customer_stats").select("*", { count: "exact" }).eq("role", "customer");
  const term = s("q")?.replace(/[%,()]/g, " ").trim();
  if (term) q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  if (s("desde")) q = q.gte("created_at", startOfDayAR(s("desde")!).toISOString());
  if (s("hasta")) q = q.lt("created_at", new Date(startOfDayAR(s("hasta")!).getTime() + 86_400_000).toISOString());
  if (s("min_compras")) q = q.gte("orders_count", Number(s("min_compras")));
  if (s("max_compras")) q = q.lte("orders_count", Number(s("max_compras")));
  if (s("estado") === "activo") q = q.eq("active", true);
  if (s("estado") === "inactivo") q = q.eq("active", false);
  const order = s("orden") ?? "recientes";
  q = order === "compras" ? q.order("orders_count", { ascending: false }) : order === "gasto" ? q.order("total_spent", { ascending: false }) : q.order("created_at", { ascending: false });

  const [{ data, count }, { data: staff }] = await Promise.all([
    q.range((page - 1) * perPage, page * perPage - 1),
    db.from("profiles").select("id, email, full_name, role, permissions, active").in("role", ["staff", "admin"]).order("role"),
  ]);
  const customers = (data ?? []) as CustomerRow[];
  const pages = Math.ceil((count ?? 0) / perPage);
  const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "pagina") as [string, string][]);

  return (
    <div className="space-y-6">
      <PageTitle>Usuarios</PageTitle>

      <Card title={`Clientes registrados (${count ?? 0})`}>
        <form className="mb-4 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Input name="q" placeholder="Nombre, email, teléfono" defaultValue={s("q")} className="lg:col-span-2" />
          <Input type="date" name="desde" defaultValue={s("desde")} title="Alta desde" />
          <Input type="date" name="hasta" defaultValue={s("hasta")} title="Alta hasta" />
          <div className="flex gap-2">
            <Input name="min_compras" type="number" min={0} placeholder="Compras mín" defaultValue={s("min_compras")} />
            <Input name="max_compras" type="number" min={0} placeholder="máx" defaultValue={s("max_compras")} />
          </div>
          <Select name="estado" defaultValue={s("estado") ?? ""}>
            <option value="">Activos e inactivos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </Select>
          <Select name="orden" defaultValue={order}>
            <option value="recientes">Más recientes</option>
            <option value="compras">Más compras</option>
            <option value="gasto">Mayor gasto</option>
          </Select>
          <Button type="submit">Filtrar</Button>
        </form>
        {customers.length === 0 ? (
          <EmptyState>No hay clientes con esos filtros.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr><th className="p-2">Cliente</th><th className="p-2">Alta</th><th className="p-2 text-right">Compras</th><th className="p-2 text-right">Total gastado</th><th className="p-2">Última compra</th><th className="p-2">Estado</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="p-2">
                      <Link href={`/admin/usuarios/${c.id}`} className="font-semibold underline">{c.full_name || c.email}</Link>
                      <span className="block text-xs text-neutral-500">{c.email}{c.phone && ` · ${c.phone}`}</span>
                    </td>
                    <td className="p-2">{formatDate(c.created_at)}</td>
                    <td className="p-2 text-right">{c.orders_count}</td>
                    <td className="p-2 text-right">{formatMoney(c.total_spent)}</td>
                    <td className="p-2">{formatDate(c.last_order_at)}</td>
                    <td className="p-2">{c.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-4 flex flex-wrap gap-1 text-sm">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Link key={p} href={`/admin/usuarios?${params}${params.size ? "&" : ""}pagina=${p}`} className={`border px-3 py-1 ${p === page ? "border-black bg-black text-white" : "border-neutral-300"}`}>{p}</Link>
            ))}
          </nav>
        )}
      </Card>

      <Card title="Administradores y staff">
        <ul className="mb-6 divide-y divide-neutral-100 text-sm">
          {(staff ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <Link href={`/admin/usuarios/${u.id}`} className="font-semibold underline">{u.full_name || u.email}</Link>
              <span className="text-xs text-neutral-500">{u.email}</span>
              <Badge tone={u.role === "admin" ? "blue" : "neutral"}>{u.role === "admin" ? "Administrador" : "Staff"}</Badge>
              {u.role === "staff" && (
                <span className="text-xs text-neutral-500">{(u.permissions as Permission[]).map((p) => PERMISSION_LABEL[p]).join(", ") || "Sin permisos"}</span>
              )}
              {!u.active && <Badge tone="red">Inactivo</Badge>}
            </li>
          ))}
        </ul>
        {me?.role === "admin" ? <AddStaffForm /> : <p className="text-xs text-neutral-500">Solo un administrador puede gestionar roles.</p>}
      </Card>
    </div>
  );
}
