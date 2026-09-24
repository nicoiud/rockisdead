"use client";

import { useState } from "react";
import type { Address } from "@/lib/types";
import { Alert } from "@/components/ui";
import { AddressForm } from "../forms";

export function AddressEditor({ address }: { address?: Address }) {
  const [open, setOpen] = useState(!address);
  const [key, setKey] = useState(0);
  const [saved, setSaved] = useState(false);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="underline">Editar</button>;
  }
  return (
    <div className="w-full space-y-3 normal-case">
      {saved && <Alert tone="success">Dirección guardada</Alert>}
      <AddressForm
        key={key}
        address={address}
        onDone={() => {
          if (address) {
            setOpen(false);
          } else {
            // Formulario limpio para cargar otra
            setSaved(true);
            setKey((k) => k + 1);
          }
        }}
      />
    </div>
  );
}
