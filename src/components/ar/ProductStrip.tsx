"use client";

import { cn } from "@/lib/utils";
import { formatTND, type Product } from "@/lib/catalog";

export function ProductStrip({
  products,
  selectedId,
  onSelect,
}: {
  products: Product[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-3">
      {products.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          aria-pressed={p.id === selectedId}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-xl border bg-black/60 px-3 py-2 text-left backdrop-blur",
            p.id === selectedId ? "border-primary" : "border-white/10",
          )}
        >
          <span className="size-6 rounded-full border border-white/20" style={{ background: p.color }} />
          <span>
            <span className="block text-xs font-medium">{p.name}</span>
            <span className="block text-[11px] text-muted-foreground">{formatTND(p.priceTND)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
