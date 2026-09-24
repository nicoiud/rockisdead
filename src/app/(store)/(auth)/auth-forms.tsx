"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, register, requestPasswordReset, updatePassword } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Contraseña"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Ingresando…">Ingresar</SubmitButton>
      <div className="flex justify-between text-sm">
        <Link href="/recuperar" className="underline">Olvidé mi contraseña</Link>
        <Link href={`/registro${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold underline">Crear cuenta</Link>
      </div>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(register, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Nombre y apellido"><Input name="full_name" autoComplete="name" required /></Field>
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Teléfono (opcional)"><Input name="phone" type="tel" autoComplete="tel" /></Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Creando…">Crear cuenta</SubmitButton>
      <p className="text-sm">¿Ya tenés cuenta? <Link href="/login" className="font-bold underline">Ingresá</Link></p>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email"><Input name="email" type="email" required /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nueva contraseña"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <Field label="Repetir contraseña"><Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Guardar contraseña</SubmitButton>
    </form>
  );
}
