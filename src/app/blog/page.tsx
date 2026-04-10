import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import type { PostMeta } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Engineering insights, product updates, and deep dives from the Parametric Memory team.",
  alternates: { canonical: "https://parametric-memory.dev/blog" },
  keywords: [
    "AI memory blog",
    "Merkle proof articles",
    "AI agent memory",
    "persistent memory insights",
    "AI memory architecture",
  ],
  openGraph: {
    title: "Blog | Parametric Memory",
    description:
      "Engineering insights, product updates, and deep dives from the Parametric Memory team.",
    url: "https://parametric-memory.dev/blog",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory Blog",
      },
    ],
    type: "website",
  },
};

// ── Tag pill ─────────────────────────────────────────────────────────────────

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="bg-surface-800 text-surface-400 border-surface-700 rounded-full border px-2 py-0.5 font-mono text-[11px]">
      {tag}
    </span>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: PostMeta }) {
  const date = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group border-surface-800 bg-surface-900 hover:border-brand-500/40 hover:bg-surface-800/60 flex flex-col rounded-2xl border p-6 transition-all"
    >
      {/* Date + reading time */}
      <div className="mb-3 flex items-center gap-3">
        <time dateTime={post.date} className="text-surface-500 font-mono text-[11px]">
          {date}
        </time>
        <span className="text-surface-700">·</span>
        <span className="text-surface-500 font-mono text-[11px]">{post.readingTime} min read</span>
      </div>

      {/* Title */}
      <h2 className="font-display text-surface-100 mb-2 text-lg leading-snug font-semibold transition-colors group-hover:text-white">
        {post.title}
      </h2>

      {/* Excerpt */}
      <p className="text-surface-400 mb-4 line-clamp-3 flex-1 text-sm leading-relaxed">
        {post.excerpt}
      </p>

      {/* Footer */}
      <div className="border-surface-800 mt-auto flex items-center justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap gap-1.5">
          {post.tags?.slice(0, 3).map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
        <span className="text-brand-400 shrink-0 text-sm font-medium transition-transform group-hover:translate-x-1">
          Read →
        </span>
      </div>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-14">
        <p className="text-brand-400 mb-3 font-mono text-xs tracking-widest uppercase">
          From the team
        </p>
        <h1 className="font-display mb-4 text-4xl font-bold text-white">Blog</h1>
        <p className="text-surface-400 max-w-xl">
          Engineering deep-dives, product updates, and ideas from the team building Parametric
          Memory.
        </p>
      </div>

      {/* Grid */}
      {posts.length === 0 ? (
        <div className="border-surface-800 rounded-2xl border border-dashed py-24 text-center">
          <p className="text-surface-600 font-mono text-sm">No posts yet — check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </main>
  );
}
