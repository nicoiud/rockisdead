import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Alert, Card, PageTitle } from "@/components/ui";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage(props: PageProps<"/cuenta">) {
  const profile = await requireUser();
  const sp = await props.searchParams;
  return (
    <div className="space-y-6">
      <PageTitle>Mis datos</PageTitle>
      {sp.clave === "ok" && <Alert tone="success">Contraseña actualizada.</Alert>}
      <Card title="Datos personales"><ProfileForm profile={profile} /></Card>
      <Card title="Contraseña"><PasswordForm /></Card>
    </div>
  );
}
