import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Airdrop — LOBSTR",
  description: "Claim your LOB token airdrop allocation.",
};

export default function AirdropLayout({ children }: { children: React.ReactNode }) {
  return children;
}
