import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import matter from "gray-matter";

const DOCS_DIR = join(process.cwd(), "content", "docs");

export interface DocFrontmatter {
  title: string;
  description: string;
  section?: string;
  order?: number;
}

function collectMdxFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMdxFiles(full, base));
    } else if (entry.name.endsWith(".mdx")) {
      files.push(full);
    }
  }
  return files;
}

/** All slugs that exist on disk — used by generateStaticParams */
export function getAllDocSlugs(): string[] {
  const files = collectMdxFiles(DOCS_DIR);
  return files.map((f) =>
    relative(DOCS_DIR, f)
      .replace(/\.mdx$/, "")
      .replace(/\\/g, "/"),
  );
}

/** Read and parse a single doc by its slug (e.g. "api/atoms") */
export function getDocBySlug(slug: string): {
  frontmatter: DocFrontmatter;
  content: string;
} {
  const filePath = join(DOCS_DIR, `${slug}.mdx`);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: ${slug}`);
  }
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return {
    frontmatter: data as DocFrontmatter,
    content,
  };
}
