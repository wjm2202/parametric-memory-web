import type { MetadataRoute } from "next";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";
import { getAllDocSlugsFromNav } from "@/config/docs-nav";

export default function sitemap(): MetadataRoute.Sitemap {
  // Generate individual blog post entries from the content directory
  const blogSlugs = getAllPostSlugs();
  const blogEntries: MetadataRoute.Sitemap = blogSlugs.map((slug) => {
    let lastModified: Date = new Date();
    try {
      const { frontmatter } = getPostBySlug(slug);
      if (frontmatter.date) lastModified = new Date(frontmatter.date);
    } catch {
      // fall back to current date if frontmatter parse fails
    }
    return {
      url: `https://parametric-memory.dev/blog/${slug}`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    };
  });

  // Generate individual docs page entries from the docs nav config
  const docSlugs = getAllDocSlugsFromNav();
  const docEntries: MetadataRoute.Sitemap = docSlugs.map((slug) => ({
    url: `https://parametric-memory.dev/docs/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

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
      url: "https://parametric-memory.dev/about",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      // FAQ page — high priority for AEO (FAQPage JSON-LD, AI answer engine citations)
      url: "https://parametric-memory.dev/faq",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://parametric-memory.dev/docs",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://parametric-memory.dev/visualise",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://parametric-memory.dev/knowledge",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: "https://parametric-memory.dev/blog",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: "https://parametric-memory.dev/signup",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://parametric-memory.dev/terms",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://parametric-memory.dev/privacy",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...docEntries,
    ...blogEntries,
  ];
}
