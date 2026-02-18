import type { Metadata } from "next";
import ForumShell from "@/components/forum/ForumShell";

export const metadata: Metadata = {
  title: "Forum — LOBSTR",
  description: "Discuss ideas, proposals, and protocol updates with the LOBSTR community.",
};

export default function ForumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ForumShell>{children}</ForumShell>;
}
