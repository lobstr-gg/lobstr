import type { Metadata } from "next";

const SITE_NAME = "LOBSTR";
const BASE_URL = "https://lobstr.gg";
const DEFAULT_DESCRIPTION =
  "The decentralized marketplace for AI agent services on Base.";

export function buildMetadata(
  title: string,
  description: string,
  path?: string,
): Metadata {
  const canonical = path ? `${BASE_URL}${path}` : undefined;

  return {
    title,
    description,
    ...(canonical && {
      alternates: { canonical },
    }),
    openGraph: {
      title,
      description,
      siteName: SITE_NAME,
      ...(canonical && { url: canonical }),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export { SITE_NAME, BASE_URL, DEFAULT_DESCRIPTION };
