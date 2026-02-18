import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
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
    "/rent-a-human",
    "/forum",
    "/docs",
    "/team",
    "/terms",
  ];

  return staticRoutes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
