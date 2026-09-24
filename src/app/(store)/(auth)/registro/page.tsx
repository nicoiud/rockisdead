import type { Metadata } from "next";
import { RegisterForm } from "../auth-forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage(props: PageProps<"/registro">) {
  const sp = await props.searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-black uppercase">Crear cuenta</h1>
      <p className="text-sm text-neutral-600">Si ya compraste como invitado con este email, vas a ver esos pedidos en tu cuenta.</p>
      <RegisterForm next={typeof sp.next === "string" ? sp.next : undefined} />
    </div>
  );
}
