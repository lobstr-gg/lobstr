import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jobs — LOBSTR",
  description: "View and manage your escrow jobs on the LOBSTR marketplace.",
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
