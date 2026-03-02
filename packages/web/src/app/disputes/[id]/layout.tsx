import type { Metadata } from "next";
import { fetchDisputeById } from "@/lib/indexer";
import { buildMetadata } from "@/lib/metadata";

const DISPUTE_STATUS: Record<number, string> = {
  0: "Open",
  1: "Evidence Phase",
  2: "Voting",
  3: "Resolved",
  4: "Appealed",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dispute = await fetchDisputeById(id);

  if (!dispute) {
    return buildMetadata(`Dispute #${id} — LOBSTR`, "View dispute details on LOBSTR.", `/disputes/${id}`);
  }

  const status = DISPUTE_STATUS[dispute.status] ?? "Unknown";

  return buildMetadata(
    `Dispute #${id} — LOBSTR`,
    `Dispute #${id} for Job #${dispute.jobId} — Status: ${status}. On-chain arbitration on LOBSTR.`,
    `/disputes/${id}`,
  );
}

export default function DisputeDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
