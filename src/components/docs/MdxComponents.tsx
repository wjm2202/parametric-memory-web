import type { MDXComponents } from "mdx/types";
import Link from "next/link";

// ── Heading anchor helper ────────────────────────────────────────────────────

function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      className="text-brand-400 ml-2 no-underline opacity-0 transition-opacity group-hover:opacity-60"
      aria-hidden="true"
    >
      #
    </a>
  );
}

// ── Component map ────────────────────────────────────────────────────────────

export const mdxComponents: MDXComponents = {
  h1: ({ children }) => {
    const id = slugify(String(children));
    return (
      <h1
        id={id}
        className="group font-display border-surface-800 mt-0 mb-6 scroll-mt-20 border-b pb-4 text-2xl leading-tight font-bold text-white"
      >
        {children}
        <HeadingAnchor id={id} />
      </h1>
    );
  },

  h2: ({ children }) => {
    const id = slugify(String(children));
    return (
      <h2
        id={id}
        className="group font-display text-surface-100 mt-12 mb-4 scroll-mt-20 text-xl font-semibold"
      >
        {children}
        <HeadingAnchor id={id} />
      </h2>
    );
  },

  h3: ({ children }) => {
    const id = slugify(String(children));
    return (
      <h3
        id={id}
        className="group font-display text-surface-200 mt-8 mb-3 scroll-mt-20 text-base font-semibold"
      >
        {children}
        <HeadingAnchor id={id} />
      </h3>
    );
  },

  h4: ({ children }) => (
    <h4 className="font-display text-surface-400 mt-6 mb-2 text-sm font-semibold tracking-wider uppercase">
      {children}
    </h4>
  ),

  p: ({ children }) => <p className="text-surface-300 mb-5 leading-7">{children}</p>,

  a: ({ href, children }) => {
    const isExternal = href?.startsWith("http");
    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-400 decoration-brand-400/40 hover:decoration-brand-400 underline underline-offset-2 transition-colors"
        >
          {children}
        </a>
      );
    }
    return (
      <Link
        href={href ?? "#"}
        className="text-brand-400 decoration-brand-400/40 hover:decoration-brand-400 underline underline-offset-2 transition-colors"
      >
        {children}
      </Link>
    );
  },

  // Inline code
  code: ({ children, ...props }) => {
    // rehype-pretty-code wraps block code in <code data-language="...">
    // We only style "naked" inline code here
    const isBlock = "data-language" in props || "data-theme" in props;
    if (isBlock) return <code {...props}>{children}</code>;
    return (
      <code className="bg-surface-800 rounded px-1.5 py-0.5 font-mono text-sm text-amber-300">
        {children}
      </code>
    );
  },

  // Code block wrapper — rehype-pretty-code produces a <figure> with data-rehype-pretty-code-figure
  // We target that via CSS, but also wrap <pre> for custom scrollbar + bg
  pre: ({ children, ...props }) => (
    <pre
      className="bg-surface-900 border-surface-800 [&>[data-highlighted-line]]:bg-brand-500/10 [&>[data-highlighted-line]]:border-brand-500 my-6 overflow-x-auto rounded-xl border p-4 font-mono text-sm leading-relaxed [&>[data-highlighted-line]]:border-l-2 [&>[data-line]]:px-2"
      {...props}
    >
      {children}
    </pre>
  ),

  // Blockquote — used as callout
  blockquote: ({ children }) => (
    <blockquote className="border-brand-500 bg-brand-500/5 text-surface-300 my-6 rounded-r-lg border-l-2 py-3 pr-4 pl-4 italic [&>p]:mb-0">
      {children}
    </blockquote>
  ),

  ul: ({ children }) => (
    <ul className="text-surface-300 mb-5 list-disc space-y-1 pl-6">{children}</ul>
  ),

  ol: ({ children }) => (
    <ol className="text-surface-300 mb-5 list-decimal space-y-1 pl-6">{children}</ol>
  ),

  li: ({ children }) => <li className="leading-7">{children}</li>,

  hr: () => <hr className="border-surface-800 my-10" />,

  table: ({ children }) => (
    <div className="border-surface-800 my-6 overflow-x-auto rounded-xl border">
      <table className="divide-surface-800 min-w-full divide-y text-sm">{children}</table>
    </div>
  ),

  thead: ({ children }) => <thead className="bg-surface-900">{children}</thead>,

  tbody: ({ children }) => <tbody className="divide-surface-800/60 divide-y">{children}</tbody>,

  tr: ({ children }) => <tr className="odd:bg-surface-950 even:bg-surface-900/40">{children}</tr>,

  th: ({ children }) => (
    <th className="font-display text-surface-400 px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">
      {children}
    </th>
  ),

  td: ({ children }) => <td className="text-surface-300 px-4 py-3">{children}</td>,

  strong: ({ children }) => <strong className="text-surface-100 font-semibold">{children}</strong>,

  em: ({ children }) => <em className="text-surface-300 italic">{children}</em>,
};
