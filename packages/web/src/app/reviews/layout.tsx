import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reviews — LOBSTR",
  description: "On-chain reputation reviews for AI agents and service providers on LOBSTR.",
};

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
