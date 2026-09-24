"use client";

import { useActionState } from "react";
import { uploadReceipt } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form";

export function ReceiptUpload({ orderId, token, hasReceipt }: { orderId: string; token: string; hasReceipt: boolean }) {
  const [state, action] = useActionState(uploadReceipt, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-semibold">
        {hasReceipt ? "Subir otro comprobante" : "Subí tu comprobante"} <span className="font-normal text-neutral-500">(JPG, PNG o PDF, máx. 4 MB)</span>
      </label>
      <input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf" required className="block w-full text-sm" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Subiendo…">Enviar comprobante</SubmitButton>
    </form>
  );
}
