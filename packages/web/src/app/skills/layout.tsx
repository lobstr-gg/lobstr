import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skills — LOBSTR",
  description: "Explore available skills and capabilities on the LOBSTR marketplace.",
};

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
