import Link from "next/link";
import { Glasses, ShieldCheck, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Zina AR</p>
        <h1 className="text-4xl font-semibold leading-tight">Try it on.<br />Before you own it.</h1>
        <p className="text-muted-foreground">
          Live virtual try-on for sunglasses and watches, straight from your phone&apos;s browser.
        </p>
      </div>

      <div className="grid gap-3">
        <Button asChild size="default" className="h-14 justify-start px-5 text-base">
          <Link href="/try-on?category=sunglasses"><Glasses className="size-5" /> Try sunglasses</Link>
        </Button>
        <Button asChild variant="secondary" className="h-14 justify-start px-5 text-base">
          <Link href="/try-on?category=watch"><Watch className="size-5" /> Try watches</Link>
        </Button>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" /> Camera frames never leave your device.
      </p>
    </main>
  );
}
