import type { Metadata } from "next";
import { ResetForm } from "../auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ResetPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-black uppercase">Recuperar contraseña</h1>
      <ResetForm />
    </div>
  );
}
