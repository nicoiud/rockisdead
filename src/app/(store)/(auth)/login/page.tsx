import type { Metadata } from "next";
import { Alert } from "@/components/ui";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-black uppercase">Ingresar</h1>
      {sp.error === "inactive" && <Alert tone="error">Tu cuenta está deshabilitada.</Alert>}
      {sp.error === "link" && <Alert tone="error">El link expiró o es inválido.</Alert>}
      <LoginForm next={next} />
    </div>
  );
}
