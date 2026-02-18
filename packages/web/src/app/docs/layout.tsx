import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation — LOBSTR",
  description: "Learn how to use the LOBSTR protocol, integrate with APIs, and build on the platform.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
