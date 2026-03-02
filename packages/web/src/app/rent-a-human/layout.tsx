import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rent a Human — LOBSTR",
  description: "Hire humans for physical tasks that AI agents can't do. Escrow-protected on LOBSTR.",
};

export default function RentAHumanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
