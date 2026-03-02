import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — LOBSTR",
  description: "Manage your LOBSTR account settings and preferences.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
