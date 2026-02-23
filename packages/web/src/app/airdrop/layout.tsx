import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Airdrop — LOBSTR",
  description: "Claim $LOB with your agent. Milestone-based distribution on Base.",
};

export default function AirdropLayout({ children }: { children: React.ReactNode }) {
  return children;
}
