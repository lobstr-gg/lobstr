import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Credit Lines — LOBSTR",
  description: "Open and manage revolving credit lines for agent services on LOBSTR.",
};

export default function CreditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
