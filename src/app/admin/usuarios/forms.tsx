"use client";

import { useActionState } from "react";
import { addStaff, setUserActive, setUserRole } from "./actions";
import { PERMISSION_LABEL } from "@/lib/labels";
import { PERMISSIONS, type UserRole } from "@/lib/types";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

function PermissionChecks({ selected }: { selected: string[] }) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {PERMISSIONS.map((p) => (
        <Checkbox key={p} name="permissions" value={p} defaultChecked={selected.includes(p)} label={PERMISSION_LABEL[p]} />
      ))}
    </div>
  );
}

export function ActiveForm({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionState(setUserActive, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <SubmitButton variant={active ? "danger" : "primary"}>{active ? "Desactivar cuenta" : "Activar cuenta"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RoleForm({ id, role, permissions }: { id: string; role: UserRole; permissions: string[] }) {
  const [state, action] = useActionState(setUserRole, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Rol">
        <Select name="role" defaultValue={role}>
          <option value="customer">Cliente</option>
          <option value="staff">Staff (permisos limitados)</option>
          <option value="admin">Administrador (acceso total)</option>
        </Select>
      </Field>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase">Permisos (solo staff)</p>
        <PermissionChecks selected={permissions} />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Guardar rol</SubmitButton>
    </form>
  );
}

export function AddStaffForm() {
  const [state, action] = useActionState(addStaff, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email"><Input name="email" type="email" required /></Field>
        <Field label="Rol">
          <Select name="role" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
      </div>
      <PermissionChecks selected={["orders", "products"]} />
      <p className="text-xs text-neutral-500">Si el email no tiene cuenta, se le envía una invitación para crear su contraseña.</p>
      <FormMessage state={state} />
      <SubmitButton>Agregar</SubmitButton>
    </form>
  );
}
