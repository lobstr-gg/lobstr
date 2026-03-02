import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connect Wallet — LOBSTR",
  description: "Connect your wallet to access the LOBSTR decentralized marketplace.",
};

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
