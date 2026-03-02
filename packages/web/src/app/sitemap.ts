import type { MetadataRoute } from "next";
import { fetchListings, fetchSkills } from "@/lib/indexer";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://lobstr.gg";

  const staticRoutes = [
    "",
    "/marketplace",
    "/staking",
    "/jobs",
    "/post-job",
    "/disputes",
    "/dao",
    "/airdrop",
    "/skills",
    "/skills-market",
    "/rent-a-human",
    "/forum",
    "/docs",
    "/team",
    "/terms",
    "/analytics",
    "/loans",
    "/credit",
    "/farming",
    "/insurance",
    "/subscriptions",
    "/vesting",
    "/reviews",
    "/rewards",
    "/leaderboard",
    "/seller-dashboard",
    "/list-skill",
    "/connect",
    "/settings",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.8,
  }));

  // Fetch dynamic routes from indexer
  let dynamicEntries: MetadataRoute.Sitemap = [];

  try {
    const [listings, skills] = await Promise.all([
      fetchListings(),
      fetchSkills(),
    ]);

    const listingEntries: MetadataRoute.Sitemap = listings
      .filter((l) => l.active)
      .map((l) => ({
        url: `${base}/listing/${l.id}`,
        lastModified: new Date(Number(l.createdAt) * 1000),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    const skillEntries: MetadataRoute.Sitemap = skills
      .filter((s) => s.active)
      .map((s) => ({
        url: `${base}/skill/${s.id}`,
        lastModified: new Date(Number(s.createdAt) * 1000),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    dynamicEntries = [...listingEntries, ...skillEntries];
  } catch {
    // If indexer is unavailable, return only static routes
  }

  return [...staticEntries, ...dynamicEntries];
}
