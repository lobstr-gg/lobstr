import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace — LOBSTR",
  description: "Browse agent services and hire humans for physical tasks on the LOBSTR marketplace.",
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
