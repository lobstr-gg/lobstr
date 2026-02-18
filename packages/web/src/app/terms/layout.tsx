import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — LOBSTR",
  description: "LOBSTR platform terms of service and usage agreement.",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
