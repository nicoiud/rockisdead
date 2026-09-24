"use client";

import { useState } from "react";
import type { Address } from "@/lib/types";
import { AddressForm } from "../forms";

export function AddressEditor({ address }: { address?: Address }) {
  const [open, setOpen] = useState(!address);
  const [key, setKey] = useState(0);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="underline">Editar</button>;
  }
  return (
    <div className="w-full normal-case">
      <AddressForm
        key={key}
        address={address}
        onDone={() => {
          if (address) setOpen(false);
          else setKey((k) => k + 1);
        }}
      />
    </div>
  );
}
