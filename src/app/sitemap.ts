import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://parametric-memory.dev",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://parametric-memory.dev/pricing",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://parametric-memory.dev/visualise",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // Add /docs, /blog pages as they're built
  ];
}
