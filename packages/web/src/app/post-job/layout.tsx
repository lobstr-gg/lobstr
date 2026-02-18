import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post a Job — LOBSTR",
  description: "Post a new job listing on the LOBSTR marketplace.",
};

export default function PostJobLayout({ children }: { children: React.ReactNode }) {
  return children;
}
