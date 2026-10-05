"use client";

import { useEffect, useState } from "react";

export type Category = "sunglasses" | "watch";

export interface Product {
  id: string;
  name: string;
  priceTND: number;
  category: Category;
  /** 3D asset (.glb). If omitted (no request is made) or unloadable the AR engine renders a low-poly placeholder. */
  assetUrl?: string;
  /** Euler XYZ (radians) applied to the .glb so it matches the app convention: front/dial toward +Z, Y up. */
  rotation?: [number, number, number];
  /** Sunglasses: frame width relative to an average face (1 = standard, 1.1 = oversized). */
  fit?: number;
  /** Watches: real case width in mm (default 42); drives the on-wrist size. */
  caseMm?: number;
  /** Used by the placeholder geometry (and as the swatch in the UI). */
  color: string;
  style: "aviator" | "wayfarer" | "round" | "classic" | "chrono" | "minimal";
}

const FACE_X: [number, number, number] = [0, -Math.PI / 2, 0]; // model faces +X -> turn it toward +Z

export const MOCK_PRODUCTS: Product[] = [
  { id: "sg-aviator", name: "Carthage Aviator", priceTND: 289, category: "sunglasses", assetUrl: "/models/glasses/aviator.glb", color: "#d4af37", style: "aviator" },
  { id: "sg-titanium", name: "Titanium Pilot", priceTND: 349, category: "sunglasses", assetUrl: "/models/glasses/titanium.glb", color: "#5a5a5f", style: "aviator" },
  { id: "sg-rayban", name: "Medina Wayfarer", priceTND: 249, category: "sunglasses", assetUrl: "/models/glasses/rayban.glb", color: "#1a1a1a", style: "wayfarer" },
  { id: "sg-classic", name: "Hannibal Square", priceTND: 269, category: "sunglasses", assetUrl: "/models/glasses/classic.glb", rotation: FACE_X, color: "#8b5a2b", style: "wayfarer" },
  { id: "sg-round", name: "Sidi Bou Round", priceTND: 219, category: "sunglasses", assetUrl: "/models/glasses/round.glb", color: "#d46aa0", style: "round" },
  { id: "sg-maxco", name: "Kairouan Round", priceTND: 199, category: "sunglasses", assetUrl: "/models/glasses/maxco.glb", rotation: FACE_X, color: "#2a2250", style: "round" },
  { id: "w-smart-white", caseMm: 45, name: "Atlas Smart 45", priceTND: 1490, category: "watch", assetUrl: "/models/watches/apple.glb", color: "#e8e8ea", style: "minimal" },
  { id: "w-smart-blue", caseMm: 41, name: "Nile Smart", priceTND: 1390, category: "watch", assetUrl: "/models/watches/apple-series7.glb", color: "#1f3a5f", style: "minimal" },
  { id: "w-ultra", caseMm: 49, name: "Atlas Ultra", priceTND: 2490, category: "watch", assetUrl: "/models/watches/apple-ultra2.glb", color: "#ff7a1a", style: "chrono" },
  { id: "w-chrono", caseMm: 44, name: "Djerba Chrono Steel", priceTND: 1890, category: "watch", assetUrl: "/models/watches/seiko.glb", color: "#c0c0c0", style: "chrono" },
  { id: "w-digital", caseMm: 45, name: "Rugged Digital", priceTND: 590, category: "watch", assetUrl: "/models/watches/digital.glb", rotation: FACE_X, color: "#222226", style: "classic" },
  { id: "w-round", caseMm: 46, name: "Sahara Round Smart", priceTND: 990, category: "watch", assetUrl: "/models/watches/smartwatch.glb", color: "#2b2b2b", style: "classic" },
];

interface ProductRow {
  id: string;
  name: string;
  price_tnd: number;
  category: Category;
  asset_url?: string | null;
  color?: string | null;
  style?: Product["style"] | null;
}

/**
 * Optional Supabase source via PostgREST (no SDK needed). Expects a `products` table with
 * columns: id, name, price_tnd, category, asset_url, color, style.
 * Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY; otherwise mock data is used.
 */
async function fetchSupabaseProducts(signal: AbortSignal): Promise<Product[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/products?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const rows = (await res.json()) as ProductRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    priceTND: r.price_tnd,
    category: r.category,
    assetUrl: r.asset_url ?? undefined,
    color: r.color ?? "#c0c0c0",
    style: r.style ?? (r.category === "watch" ? "classic" : "wayfarer"),
  }));
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [source, setSource] = useState<"mock" | "supabase">("mock");

  useEffect(() => {
    const ctrl = new AbortController();
    fetchSupabaseProducts(ctrl.signal)
      .then((rows) => {
        if (rows?.length) {
          setProducts(rows);
          setSource("supabase");
        }
      })
      .catch(() => {
        /* keep mock data */
      });
    return () => ctrl.abort();
  }, []);

  return { products, source };
}

export const formatTND = (n: number) => `${n.toLocaleString("en-US")} TND`;
