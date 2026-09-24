"use client";

import { useActionState } from "react";
import { changePassword, saveAddress, updateProfile } from "./actions";
import type { Address, Profile } from "@/lib/types";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateProfile, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Email" hint="Para cambiarlo, escribinos."><Input value={profile.email} disabled /></Field>
      <Field label="Nombre y apellido"><Input name="full_name" defaultValue={profile.full_name ?? ""} required /></Field>
      <Field label="Teléfono"><Input name="phone" type="tel" defaultValue={profile.phone ?? ""} /></Field>
      <Field label="DNI / CUIT"><Input name="document" defaultValue={profile.document ?? ""} /></Field>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nueva contraseña"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <Field label="Repetir"><Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>Cambiar contraseña</SubmitButton>
      </div>
    </form>
  );
}

export function AddressForm({ address, onDone }: { address?: Address; onDone?: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof saveAddress>[0], fd: FormData) => {
    const res = await saveAddress(prev, fd);
    if (res?.ok) onDone?.();
    return res;
  }, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={address?.id ?? ""} />
      <Field label="Nombre (ej. Casa)"><Input name="label" defaultValue={address?.label ?? ""} /></Field>
      <Field label="Quién recibe"><Input name="recipient" defaultValue={address?.recipient ?? ""} required /></Field>
      <Field label="Calle"><Input name="street" defaultValue={address?.street ?? ""} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Altura"><Input name="number" defaultValue={address?.number ?? ""} required /></Field>
        <Field label="Piso/Depto"><Input name="apartment" defaultValue={address?.apartment ?? ""} /></Field>
      </div>
      <Field label="Localidad"><Input name="city" defaultValue={address?.city ?? ""} required /></Field>
      <Field label="Provincia"><Input name="province" defaultValue={address?.province ?? ""} required /></Field>
      <Field label="Código postal"><Input name="postal_code" defaultValue={address?.postal_code ?? ""} required /></Field>
      <Field label="Teléfono"><Input name="phone" defaultValue={address?.phone ?? ""} /></Field>
      <Field label="Indicaciones" className="sm:col-span-2"><Input name="notes" defaultValue={address?.notes ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_default" value="1" defaultChecked={address?.is_default} className="accent-black" /> Dirección principal
      </label>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>Guardar dirección</SubmitButton>
      </div>
    </form>
  );
}
