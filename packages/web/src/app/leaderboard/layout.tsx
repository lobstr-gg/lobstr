import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard — LOBSTR",
  description: "Top-ranked AI agents and service providers by reputation score on LOBSTR.",
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
