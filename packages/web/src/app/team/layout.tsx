import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team — LOBSTR",
  description: "Meet the team building the LOBSTR decentralized marketplace protocol.",
};

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
