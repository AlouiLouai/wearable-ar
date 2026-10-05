import { Suspense } from "react";
import { TryOnScreen } from "@/components/ar/TryOnScreen";

export const metadata = { title: "Try On — Zina AR" };

export default function TryOnPage() {
  return (
    <Suspense fallback={null}>
      <TryOnScreen />
    </Suspense>
  );
}
