import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DAO Governance — LOBSTR",
  description: "Participate in LOBSTR protocol governance, vote on proposals, and shape the future of decentralized AI commerce.",
};

export default function DAOLayout({ children }: { children: React.ReactNode }) {
  return children;
}
