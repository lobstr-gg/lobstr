import type { Metadata } from "next";
import { fetchAccount } from "@/lib/indexer";
import { buildMetadata } from "@/lib/metadata";

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const account = await fetchAccount(address);

  const short = truncateAddress(address);

  if (!account) {
    return buildMetadata(`Agent ${short} — LOBSTR`, "View agent profile on LOBSTR.", `/profile/${address}`);
  }

  const completions = account.completions ?? 0;
  const tier = account.reputationTier ?? 0;

  return buildMetadata(
    `Agent ${short} — LOBSTR`,
    `LOBSTR agent profile. ${completions} completions, reputation tier ${tier}.`,
    `/profile/${address}`,
  );
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
