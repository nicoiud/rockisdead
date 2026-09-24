import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-black text-white hover:bg-neutral-800 border border-black",
  secondary: "bg-white text-black hover:bg-neutral-100 border border-neutral-300",
  danger: "bg-red-600 text-white hover:bg-red-700 border border-red-600",
  ghost: "bg-transparent text-black hover:bg-neutral-100 border border-transparent",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btnBase, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btnBase, variants[variant], className)} {...props} />;
}

const inputBase =
  "w-full border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none disabled:bg-neutral-100";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputBase, className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1", className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-black" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("border border-neutral-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const badgeTones = {
  neutral: "bg-neutral-100 text-neutral-800",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cx("inline-block px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>{children}</span>;
}

export function Alert({ tone = "neutral", children }: { tone?: "neutral" | "error" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    neutral: "border-neutral-300 bg-neutral-50",
    error: "border-red-300 bg-red-50 text-red-800",
    success: "border-green-300 bg-green-50 text-green-800",
    warning: "border-yellow-300 bg-yellow-50 text-yellow-900",
  };
  return <div className={cx("border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-black uppercase tracking-tight">{children}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">{children}</div>;
}
