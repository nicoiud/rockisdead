"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export interface NavItem { href: string; label: string; badge?: number }

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((it) => {
        const active = it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cx(
              "flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-sm font-semibold uppercase tracking-wide",
              active ? "bg-white text-black" : "text-neutral-300 hover:bg-neutral-800",
            )}
          >
            {it.label}
            {!!it.badge && <span className="rounded-full bg-red-600 px-2 text-xs text-white">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
