"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Glasses, ShoppingBag, Watch } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/try-on?category=sunglasses", label: "Sunglasses", icon: Glasses, match: (p: string, c: string | null) => p === "/try-on" && c !== "watch" },
  { href: "/try-on?category=watch", label: "Watches", icon: Watch, match: (p: string, c: string | null) => p === "/try-on" && c === "watch" },
  { href: "/catalog", label: "Catalog", icon: ShoppingBag, match: (p: string) => p.startsWith("/catalog") },
];

export function BottomNav() {
  const pathname = usePathname();
  const category = useSearchParams().get("category");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname, category);
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
