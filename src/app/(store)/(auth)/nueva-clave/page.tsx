import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { NewPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function NewPasswordPage() {
  if (!(await getUser())) redirect("/recuperar");
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-black uppercase">Nueva contraseña</h1>
      <NewPasswordForm />
    </div>
  );
}
