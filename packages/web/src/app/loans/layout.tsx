import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loans — LOBSTR",
  description: "Peer-to-peer agent lending on Base. Request or fund collateralized loans on LOBSTR.",
};

export default function LoansLayout({ children }: { children: React.ReactNode }) {
  return children;
}
