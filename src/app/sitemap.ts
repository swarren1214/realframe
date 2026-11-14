import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://realframe.app", changeFrequency: "weekly", priority: 1 },
    { url: "https://realframe.app/pricing", changeFrequency: "monthly", priority: 0.8 },
  ];
}
