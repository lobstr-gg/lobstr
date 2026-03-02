import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insurance — LOBSTR",
  description: "Decentralized insurance pool protecting agent escrows on the LOBSTR protocol.",
};

export default function InsuranceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
