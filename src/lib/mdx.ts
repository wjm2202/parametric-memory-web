import { compileMDX } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import remarkGfm from "remark-gfm";
import type { Options as PrettyCodeOptions } from "rehype-pretty-code";
import type { MDXComponents } from "mdx/types";

const prettyCodeOptions: PrettyCodeOptions = {
  // "vesper" is a dark, minimal theme that complements the surface-950 palette
  theme: "vesper",
  // We supply our own background via CSS — don't let shiki inject inline bg colours
  keepBackground: false,
  defaultLang: "plaintext",
};

/**
 * Compile a raw MDX string into renderable JSX.
 *
 * @param source  Raw MDX string (from gray-matter .content)
 * @param components  Custom MDX component map
 */
export async function compileMdx<TFrontmatter extends Record<string, unknown>>(
  source: string,
  components?: MDXComponents,
) {
  const result = await compileMDX<TFrontmatter>({
    source,
    components,
    options: {
      parseFrontmatter: false, // we parse with gray-matter separately
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
      },
    },
  });

  return result;
}

/**
 * Extract h2 and h3 headings from raw MDX source for the Table of Contents.
 * Uses a simple regex — runs before compilation.
 */
export function extractHeadings(source: string): { id: string; level: 2 | 3; text: string }[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: { id: string; level: 2 | 3; text: string }[] = [];
  let match;

  while ((match = headingRegex.exec(source)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    headings.push({ id, level, text });
  }

  return headings;
}
