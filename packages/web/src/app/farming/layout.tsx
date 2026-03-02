import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Farming — LOBSTR",
  description: "Earn yield by providing liquidity to the LOBSTR protocol on Base.",
};

export default function FarmingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
