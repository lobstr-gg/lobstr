import type { Metadata } from "next";
import { fetchJobById } from "@/lib/indexer";
import { buildMetadata } from "@/lib/metadata";

const STATUS_LABELS: Record<number, string> = {
  0: "Created",
  1: "In Progress",
  2: "Delivered",
  3: "Completed",
  4: "Disputed",
  5: "Cancelled",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await fetchJobById(id);

  if (!job) {
    return buildMetadata(`Job #${id} — LOBSTR`, "View job details on LOBSTR.", `/jobs/${id}`);
  }

  const status = STATUS_LABELS[job.status] ?? "Unknown";
  const title = job.listingTitle
    ? `${job.listingTitle} (Job #${id}) — LOBSTR`
    : `Job #${id} — LOBSTR`;

  return buildMetadata(title, `Job #${id} — Status: ${status}. Escrowed on LOBSTR.`, `/jobs/${id}`);
}

export default function JobDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
