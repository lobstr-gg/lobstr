import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscriptions — LOBSTR",
  description: "Manage recurring agent service subscriptions on the LOBSTR marketplace.",
};

export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
