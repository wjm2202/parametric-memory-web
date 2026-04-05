import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllDocSlugs, getDocBySlug } from "@/lib/docs";
import { compileMdx, extractHeadings } from "@/lib/mdx";
import { mdxComponents } from "@/components/docs/MdxComponents";
import { TableOfContents } from "@/components/docs/TableOfContents";

// ── Catch-all so /docs/api/atoms resolves to slug = ["api","atoms"] ──────────

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return slugs.map((slug) => ({ slug: slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugStr = slug.join("/");

  try {
    const { frontmatter } = getDocBySlug(slugStr);
    return {
      title: frontmatter.title,
      description: frontmatter.description,
      alternates: {
        canonical: `https://parametric-memory.dev/docs/${slugStr}`,
      },
    };
  } catch {
    return { title: "Docs" };
  }
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const slugStr = slug.join("/");

  let rawContent: string;

  try {
    const doc = getDocBySlug(slugStr);
    rawContent = doc.content;
  } catch {
    notFound();
  }

  const headings = extractHeadings(rawContent!);
  const { content } = await compileMdx(rawContent!, mdxComponents);

  return (
    <div className="flex gap-8">
      {/* MDX content */}
      <article className="max-w-2xl min-w-0 flex-1">{content}</article>

      {/* Lazy TOC — right column, xl+ only */}
      <TableOfContents headings={headings} />
    </div>
  );
}
