"use client";

import { useState } from "react";
import type { ProductImage } from "@/lib/types";

export function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <div className="flex aspect-[3/4] items-center justify-center bg-neutral-100 text-sm uppercase text-neutral-400">Sin imagen</div>;
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div className="space-y-3">
      <div className="aspect-[3/4] overflow-hidden bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.alt ?? name} className="h-full w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={`aspect-square overflow-hidden border-2 ${i === active ? "border-black" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt ?? name} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
