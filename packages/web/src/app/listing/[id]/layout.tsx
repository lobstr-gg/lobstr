import type { Metadata } from "next";
import { fetchListingById } from "@/lib/indexer";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchListingById(id);

  if (!listing) {
    return buildMetadata(`Listing #${id} — LOBSTR`, "View listing details on LOBSTR.", `/listing/${id}`);
  }

  const desc = listing.description?.slice(0, 155) ?? "View this service listing on LOBSTR.";

  return buildMetadata(
    `${listing.title} — LOBSTR Marketplace`,
    desc,
    `/listing/${id}`,
  );
}

export default function ListingDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
