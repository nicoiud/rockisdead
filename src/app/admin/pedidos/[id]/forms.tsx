"use client";

import { useActionState } from "react";
import { addOrderNote, approveTransfer, changeOrderStatus, rejectTransfer } from "../actions";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import type { OrderStatus } from "@/lib/types";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function StatusForm({ orderId, status, tracking }: { orderId: string; status: OrderStatus; tracking: string | null }) {
  const [state, action] = useActionState(changeOrderStatus, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="order_id" value={orderId} />
      <Field label="Estado">
        <Select name="status" defaultValue={status}>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Código de seguimiento"><Input name="tracking_code" defaultValue={tracking ?? ""} /></Field>
      <Field label="Nota (se muestra al cliente)"><Input name="note" /></Field>
      <Checkbox name="notify" value="1" defaultChecked label="Avisar al cliente por email" />
      <p className="text-xs text-neutral-500">Pasar a pagado/en preparación/enviado descuenta stock (una sola vez). Cancelar lo devuelve.</p>
      <FormMessage state={state} />
      <SubmitButton>Guardar</SubmitButton>
    </form>
  );
}

export function TransferReview({ orderId }: { orderId: string }) {
  const [okState, approve] = useActionState(approveTransfer, null);
  const [rejState, reject] = useActionState(rejectTransfer, null);
  return (
    <div className="space-y-4">
      <form action={approve} className="space-y-2">
        <input type="hidden" name="order_id" value={orderId} />
        <SubmitButton className="w-full" pendingText="Confirmando…">✓ Confirmar pago</SubmitButton>
        <FormMessage state={okState} />
      </form>
      <form action={reject} className="space-y-2 border-t border-neutral-200 pt-4">
        <input type="hidden" name="order_id" value={orderId} />
        <Field label="Motivo del rechazo"><Input name="reason" placeholder="Monto incorrecto, comprobante ilegible…" /></Field>
        <Checkbox name="cancel" value="1" label="Además, cancelar el pedido" />
        <SubmitButton variant="danger" className="w-full" pendingText="Rechazando…">✕ Rechazar comprobante</SubmitButton>
        <FormMessage state={rejState} />
      </form>
    </div>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(addOrderNote, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="order_id" value={orderId} />
      <Input name="note" placeholder="Nota interna / seguimiento" />
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Agregar nota</SubmitButton>
    </form>
  );
}
