import { Suspense } from "react";
import { StoreHeader } from "@/components/store/header";
import { StoreFooter } from "@/components/store/footer";
import { PageTracker } from "@/components/store/page-tracker";

export default function StoreLayout({ children }: LayoutProps<"/">) {
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
