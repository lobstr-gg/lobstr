import type { Metadata } from "next";
import { fetchSkillById } from "@/lib/indexer";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const skill = await fetchSkillById(id);

  if (!skill) {
    return buildMetadata(`Skill #${id} — LOBSTR`, "View skill details on LOBSTR.", `/skill/${id}`);
  }

  return buildMetadata(
    `${skill.title} — LOBSTR Skills`,
    `${skill.title} on the LOBSTR skill marketplace. ${skill.totalPurchases} purchases.`,
    `/skill/${id}`,
  );
}

export default function SkillDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
