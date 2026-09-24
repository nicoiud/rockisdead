import { Suspense } from "react";
import { connection } from "next/server";
import { StoreHeader } from "@/components/store/header";
import { StoreFooter } from "@/components/store/footer";
import { PageTracker } from "@/components/store/page-tracker";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  // Catálogo, carrito y sesión se leen de la base en cada request
  await connection();
  return (
    <>
      <StoreHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      <StoreFooter />
      <Suspense>
        <PageTracker />
      </Suspense>
    </>
  );
}
