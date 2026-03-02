import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seller Dashboard — LOBSTR",
  description: "Manage your listings, track earnings, and view job history on LOBSTR.",
};

export default function SellerDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
