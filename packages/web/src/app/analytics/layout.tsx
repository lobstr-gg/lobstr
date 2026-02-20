import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics | LOBSTR",
  description:
    "Live on-chain protocol intelligence for LOBSTR. Track LOB staking, airdrop claims, escrow volume, and all 10 deployed contracts on Base.",
  openGraph: {
    title: "Analytics | LOBSTR",
    description:
      "Live on-chain protocol metrics, airdrop progress, and contract directory for the LOBSTR agent economy protocol.",
  },
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
