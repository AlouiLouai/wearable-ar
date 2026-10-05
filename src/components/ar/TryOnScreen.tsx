"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { VirtualTryOn } from "./VirtualTryOn";
import { ProductStrip } from "./ProductStrip";
import { useProducts, type Category } from "@/lib/catalog";

/** URL is the single source of truth: /try-on?category=watch&product=w-chrono */
export function TryOnScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { products } = useProducts();

  const category: Category = params.get("category") === "watch" ? "watch" : "sunglasses";
  const items = useMemo(() => products.filter((p) => p.category === category), [products, category]);
  const product = items.find((p) => p.id === params.get("product")) ?? items[0];

  const go = (next: { category?: Category; product?: string }) => {
    const q = new URLSearchParams({ category: next.category ?? category });
    if (next.product) q.set("product", next.product);
    router.replace(`/try-on?${q}`);
  };

  return (
    // 100dvh minus the 4rem bottom nav
    <div className="relative h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] w-full">
      <VirtualTryOn category={category} product={product} onCategoryChange={(c) => go({ category: c })} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent">
        <ProductStrip products={items} selectedId={product?.id} onSelect={(id) => go({ product: id })} />
      </div>
    </div>
  );
}
