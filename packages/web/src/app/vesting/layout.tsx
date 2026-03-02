import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vesting — LOBSTR",
  description: "View and claim vested LOB token allocations on LOBSTR.",
};

export default function VestingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
