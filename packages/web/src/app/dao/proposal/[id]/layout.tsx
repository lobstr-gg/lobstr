import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  return buildMetadata(
    `DAO Proposal #${id} — LOBSTR`,
    `View and vote on governance proposal #${id} in the LOBSTR DAO.`,
    `/dao/proposal/${id}`,
  );
}

export default function ProposalDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
