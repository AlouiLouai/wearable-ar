"use client";

import Link from "next/link";
import { useState } from "react";
import { Glasses, Watch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatTND, useProducts, type Category } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const FILTERS: { value: Category | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sunglasses", label: "Sunglasses" },
  { value: "watch", label: "Watches" },
];

export default function CatalogPage() {
  const { products } = useProducts();
  const [filter, setFilter] = useState<Category | "all">("all");
  const shown = products.filter((p) => filter === "all" || p.category === filter);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Catalog</h1>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              filter === f.value ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {shown.map((p) => {
          const Icon = p.category === "watch" ? Watch : Glasses;
          return (
            <Card key={p.id} className="overflow-hidden">
              <div className="flex aspect-square items-center justify-center bg-secondary" style={{ color: p.color }}>
                <Icon className="size-16" strokeWidth={1.25} />
              </div>
              <CardContent className="space-y-2 p-3">
                <div>
                  <p className="text-sm font-medium leading-tight">{p.name}</p>
                  <p className="text-sm text-primary">{formatTND(p.priceTND)}</p>
                </div>
                <Badge className="text-muted-foreground">{p.category === "watch" ? "Watch" : "Sunglasses"}</Badge>
                <Button asChild size="sm" className="w-full">
                  <Link href={`/try-on?category=${p.category}&product=${p.id}`}>Try on</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
