import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";
import { compileMdx } from "@/lib/mdx";
import { mdxComponents } from "@/components/docs/MdxComponents";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { frontmatter } = getPostBySlug(slug);
    return {
      title: frontmatter.title,
      description: frontmatter.excerpt,
      alternates: {
        canonical: `https://parametric-memory.dev/blog/${slug}`,
      },
    };
  } catch {
    return { title: "Blog" };
  }
}

// ── Tag pill ─────────────────────────────────────────────────────────────────

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="bg-surface-800 text-surface-400 border-surface-700 rounded-full border px-2 py-0.5 font-mono text-[11px]">
      {tag}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;

  let frontmatter: {
    title: string;
    date: string;
    excerpt: string;
    author?: string;
    tags?: string[];
  };
  let rawContent: string;

  try {
    const post = getPostBySlug(slug);
    frontmatter = post.frontmatter;
    rawContent = post.content;
  } catch {
    notFound();
  }

  const { content } = await compileMdx(rawContent!, mdxComponents);

  const date = new Date(frontmatter!.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      {/* Back link */}
      <Link
        href="/blog"
        className="text-surface-500 hover:text-surface-300 mb-10 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        Back to blog
      </Link>

      {/* Hero */}
      <header className="mb-12">
        {/* Tags */}
        {frontmatter!.tags && frontmatter!.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {frontmatter!.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="font-display mb-4 text-3xl leading-tight font-bold text-white sm:text-4xl">
          {frontmatter!.title}
        </h1>

        {/* Meta */}
        <div className="text-surface-500 flex items-center gap-3 font-mono text-sm">
          <time dateTime={frontmatter!.date}>{date}</time>
          {frontmatter!.author && (
            <>
              <span className="text-surface-700">·</span>
              <span>{frontmatter!.author}</span>
            </>
          )}
        </div>
      </header>

      {/* MDX body */}
      <article>{content}</article>

      {/* Footer back link */}
      <div className="border-surface-800 mt-16 border-t pt-8">
        <Link
          href="/blog"
          className="text-surface-500 hover:text-surface-300 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to blog
        </Link>
      </div>
    </main>
  );
}
