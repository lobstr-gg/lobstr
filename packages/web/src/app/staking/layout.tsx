import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staking — LOBSTR",
  description: "Stake LOB tokens to unlock service provider tiers and earn protocol rewards.",
};

export default function StakingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
