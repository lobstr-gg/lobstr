import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rewards — LOBSTR",
  description: "Claim protocol rewards earned from staking and marketplace activity on LOBSTR.",
};

export default function RewardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
