import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://realframe.app", changeFrequency: "weekly", priority: 1 },
    {
      url: "https://realframe.app/pricing",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://realframe.app/faq",
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: "https://realframe.app/privacy",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://realframe.app/terms",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
