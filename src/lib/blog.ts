import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

const BLOG_DIR = join(process.cwd(), "content", "blog");

export interface PostFrontmatter {
  title: string;
  date: string; // ISO 8601
  excerpt: string;
  author?: string;
  tags?: string[];
  coverImage?: string;
}

export interface PostMeta extends PostFrontmatter {
  slug: string;
  readingTime: number; // minutes
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** All posts sorted newest-first, with metadata (no content body) */
export function getAllPosts(): PostMeta[] {
  if (!existsSync(BLOG_DIR)) return [];

  const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));

  const posts = files.map((filename) => {
    const slug = filename.replace(/\.mdx$/, "");
    const raw = readFileSync(join(BLOG_DIR, filename), "utf8");
    const { data, content } = matter(raw);
    return {
      ...(data as PostFrontmatter),
      slug,
      readingTime: estimateReadingTime(content),
    } satisfies PostMeta;
  });

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Read and parse a single post by its slug */
export function getPostBySlug(slug: string): {
  frontmatter: PostFrontmatter;
  content: string;
} {
  const filePath = join(BLOG_DIR, `${slug}.mdx`);
  if (!existsSync(filePath)) {
    throw new Error(`Post not found: ${slug}`);
  }
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return {
    frontmatter: data as PostFrontmatter,
    content,
  };
}

/** All blog slugs — used by generateStaticParams */
export function getAllPostSlugs(): string[] {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}
