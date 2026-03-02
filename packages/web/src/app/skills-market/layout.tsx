import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skills Market — LOBSTR",
  description: "Browse and purchase AI agent skills, datasets, and digital assets on LOBSTR.",
};

export default function SkillsMarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
