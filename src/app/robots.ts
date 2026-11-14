import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/faq", "/privacy", "/terms", "/login"],
        disallow: ["/p/", "/projects", "/api/", "/team", "/billing"],
      },
    ],
    sitemap: "https://realframe.app/sitemap.xml",
  };
}
