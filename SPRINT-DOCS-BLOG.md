# Sprint: Docs & Blog — Clean, Lazy-Loading Content Experience

**Created:** 2026-04-03  
**Status:** Ready to implement  
**Routes:** `/docs`, `/docs/[slug]`, `/blog`, `/blog/[slug]`  
**Constraint:** Zero new dependencies beyond `rehype-pretty-code` — everything else already installed

---

## Sprint Goal

Give users of parametric-memory.dev a professional, fast, and navigable documentation and blog experience — built on packages already in the project (`next-mdx-remote`, `shiki`, `gray-matter`). Content is authored as plain `.mdx` files. No CMS. No database.

**Customer experience wins:**

- Developers can find API docs, concepts, and guides without hunting through GitHub
- Every code block has syntax highlighting, filename labels, and line callouts
- Navigation is instant (RSC static rendering + lazy client sidebar)
- Blog keeps users informed of releases and engineering decisions

---

## Constraints & Principles

| Principle         | Decision                                                                     |
| ----------------- | ---------------------------------------------------------------------------- |
| No CMS            | MDX files in `content/docs/` and `content/blog/`                             |
| No new heavy deps | Use `next-mdx-remote`, `shiki`, `gray-matter` (already installed)            |
| One new dep       | `rehype-pretty-code` — ~5kb, uses existing `shiki`, unlocks code annotations |
| Lazy loading      | Sidebar and TOC are `dynamic()` client components — doc body is RSC          |
| Type-safe         | All frontmatter and nav config is typed with TypeScript interfaces           |
| Dark-first        | Matches existing `surface-950` / `brand-*` / amber palette                   |
| SEO               | Each page gets `generateMetadata()` from frontmatter                         |

---

## Architecture

```
content/
  docs/
    getting-started.mdx       ← frontmatter: title, description, section, order
    concepts/
      merkle-proofs.mdx
      markov-prediction.mdx
    api/
      atoms.mdx
      recall.mdx
  blog/
    2026-04-01-launch.mdx     ← frontmatter: title, date, excerpt, author, tags

src/
  config/
    docs-nav.ts               ← typed nav tree (sections → items → slug + label)
  lib/
    docs.ts                   ← getAllDocs(), getDocBySlug() — gray-matter + fs
    blog.ts                   ← getAllPosts(), getPostBySlug() — gray-matter + fs
    mdx.ts                    ← compileMDX() wrapper — rehype-pretty-code + shiki
  components/
    docs/
      DocsSidebar.tsx          ← 'use client', lazy, collapsible sections
      TableOfContents.tsx      ← 'use client', lazy, scroll-spy
      MdxComponents.tsx        ← custom h1-h6, code, pre, callout, etc.
  app/
    docs/
      layout.tsx               ← shared 3-col layout (sidebar | content | TOC)
      page.tsx                 ← redirects to first doc in nav
      [slug]/
        page.tsx               ← RSC, generateStaticParams, generateMetadata
    blog/
      layout.tsx               ← shared blog shell (navbar + footer)
      page.tsx                 ← card grid of all posts
      [slug]/
        page.tsx               ← RSC, individual post view
```

---

## Sprint Items

---

### ITEM 1 — Install `rehype-pretty-code`

**Priority:** P0 — blocking all MDX rendering  
**Effort:** XS (1 command)  
**Risk:** Low  
**Files changed:** `package.json`, `package-lock.json`

**Why:** Unlocks filename titles, line highlights, and word highlights in fenced code blocks — critical for technical docs. Uses the `shiki` already installed; no secondary syntax engine needed.

**Command:**

```bash
npm install rehype-pretty-code@^0.14.0
```

**Acceptance:**

- `rehype-pretty-code` appears in `dependencies`
- No conflicting `shiki` version

---

### ITEM 2 — `src/config/docs-nav.ts` — Typed nav config

**Priority:** P0 — required by sidebar and slug routing  
**Effort:** S  
**Risk:** Low  
**Files changed:** `src/config/docs-nav.ts` (new)

**Shape:**

```ts
export interface DocNavItem {
  title: string;
  slug: string; // matches content/docs/**/*.mdx filename (without extension)
  badge?: "new" | "beta" | "soon";
}

export interface DocNavSection {
  title: string;
  icon?: string; // optional lucide-style path string or emoji
  items: DocNavItem[];
}

export const docsNav: DocNavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", slug: "introduction" },
      { title: "Quick Start", slug: "quick-start" },
      { title: "MCP Integration", slug: "mcp-integration" },
    ],
  },
  {
    title: "Concepts",
    items: [
      { title: "Merkle Proofs", slug: "concepts/merkle-proofs" },
      { title: "Markov Prediction", slug: "concepts/markov-prediction" },
      { title: "Memory Atoms", slug: "concepts/memory-atoms" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { title: "Atoms", slug: "api/atoms" },
      { title: "Recall", slug: "api/recall", badge: "new" },
      { title: "Webhooks", slug: "api/webhooks", badge: "soon" },
    ],
  },
];
```

**Acceptance:**

- TypeScript compiles with no errors
- Config is importable by sidebar and slug page

---

### ITEM 3 — `src/lib/mdx.ts` — MDX compiler with rehype-pretty-code

**Priority:** P0 — required by all content pages  
**Effort:** S  
**Risk:** Low-medium (shiki theme must match brand palette)  
**Files changed:** `src/lib/mdx.ts` (new)

**Responsibilities:**

- Wrap `compileMDX` from `next-mdx-remote/rsc`
- Pass `rehype-pretty-code` with shiki theme `vesper` (dark, minimal — close to our palette)
- Export `MdxComponents` map (h1–h6, pre, code, callout, a)

**Key config:**

```ts
const options: CompileOptions = {
  mdxOptions: {
    rehypePlugins: [
      [
        rehypePrettyCode,
        {
          theme: "vesper",
          keepBackground: false, // we supply our own via CSS
          defaultLang: "plaintext",
        },
      ],
    ],
  },
};
```

**Acceptance:**

- Code blocks render with highlighting
- `title="..."` attribute on fenced blocks renders a filename bar
- No TS errors

---

### ITEM 4 — `src/lib/docs.ts` — Docs file reader

**Priority:** P0  
**Effort:** S  
**Risk:** Low  
**Files changed:** `src/lib/docs.ts` (new)

**Exports:**

```ts
export interface DocFrontmatter {
  title: string;
  description: string;
  section?: string;
  order?: number;
}

export async function getDocBySlug(
  slug: string,
): Promise<{ frontmatter: DocFrontmatter; content: string }>;
export async function getAllDocSlugs(): Promise<string[]>;
```

**Implementation notes:**

- Use `gray-matter` to parse frontmatter
- Slug may be nested (`api/atoms` → `content/docs/api/atoms.mdx`)
- Returns raw MDX string (compilation happens in the page RSC via `src/lib/mdx.ts`)

**Acceptance:**

- `getDocBySlug('introduction')` returns correct frontmatter and content
- Nested slugs (`api/atoms`) resolve correctly

---

### ITEM 5 — `src/lib/blog.ts` — Blog file reader

**Priority:** P1  
**Effort:** S  
**Risk:** Low  
**Files changed:** `src/lib/blog.ts` (new)

**Exports:**

```ts
export interface PostFrontmatter {
  title: string;
  date: string; // ISO 8601
  excerpt: string;
  author?: string;
  tags?: string[];
  coverImage?: string; // optional — path relative to /public
}

export interface PostMeta extends PostFrontmatter {
  slug: string;
  readingTime: number; // minutes — estimated from word count
}

export async function getAllPosts(): Promise<PostMeta[]>; // sorted newest-first
export async function getPostBySlug(
  slug: string,
): Promise<{ frontmatter: PostFrontmatter; content: string }>;
```

**Acceptance:**

- Posts sorted by date descending
- `readingTime` estimated at ~200wpm
- Missing optional fields (`author`, `tags`, `coverImage`) don't cause errors

---

### ITEM 6 — `src/components/docs/MdxComponents.tsx` — Custom MDX renderer

**Priority:** P0 — required by both docs and blog  
**Effort:** M  
**Risk:** Low  
**Files changed:** `src/components/docs/MdxComponents.tsx` (new)

**Components to implement:**

| Component       | Style notes                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- |
| `h1`            | `font-display`, 2xl, `text-white`, bottom border `brand-500/20`                          |
| `h2`            | `font-display`, xl, `text-surface-100`, mt-10                                            |
| `h3`            | `font-display`, lg, `text-surface-200`, mt-6                                             |
| `p`             | `text-surface-300`, leading-7                                                            |
| `a`             | `text-brand-400`, hover underline                                                        |
| `code` (inline) | `font-mono`, `bg-surface-800`, `text-amber-300`, px-1.5 rounded                          |
| `pre`           | dark card, rounded-xl, scrollable, `font-mono` sm                                        |
| `blockquote`    | left border `brand-500`, `bg-brand-500/5`, `text-surface-300` italic — used for callouts |
| `table`         | striped, `surface-800/50` rows, `brand-500/20` borders                                   |
| `hr`            | `border-surface-800`                                                                     |

**Acceptance:**

- All elements render without raw HTML fallback
- Mobile scrollable for `pre` blocks

---

### ITEM 7 — `src/components/docs/DocsSidebar.tsx` — Lazy doc navigation

**Priority:** P0  
**Effort:** M  
**Risk:** Medium (active-state detection via pathname)  
**Files changed:** `src/components/docs/DocsSidebar.tsx` (new)

**Design:**

- `'use client'` — loaded via `dynamic(() => import(...), { ssr: false })`
- Consumes `docsNav` from `src/config/docs-nav.ts`
- Sections are always expanded (collapse toggle is out of scope for v1)
- Active item highlighted with `bg-brand-500/10 text-brand-400 border-l-2 border-brand-500`
- Badge indicators: `new` (amber), `soon` (surface-600, pointer-events-none)
- Mobile: hidden by default, toggled via a hamburger button in the docs layout header

**Acceptance:**

- Active route highlighted correctly on hard reload
- Mobile toggle works
- No hydration mismatch

---

### ITEM 8 — `src/components/docs/TableOfContents.tsx` — Lazy TOC

**Priority:** P1  
**Effort:** M  
**Risk:** Low-medium (heading extraction from rendered MDX)  
**Files changed:** `src/components/docs/TableOfContents.tsx` (new)

**Design:**

- `'use client'` — loaded via `dynamic()`
- Receives `headings: { id: string; level: number; text: string }[]` as a prop (extracted server-side from raw MDX via regex before compile)
- Scroll-spy: `IntersectionObserver` on heading elements, active item gets `text-brand-400`
- Renders only h2 and h3 (h1 is the page title, too high-level for TOC)
- Fixed right column on desktop only (`lg:block hidden`)

**Acceptance:**

- Active heading updates on scroll
- No layout shift on load
- Hidden on mobile (doesn't break layout)

---

### ITEM 9 — `src/app/docs/layout.tsx` — Three-column docs shell

**Priority:** P0  
**Effort:** M  
**Risk:** Low  
**Files changed:** `src/app/docs/layout.tsx` (new)

**Layout:**

```
┌───────────────────────────────────────────────────────┐
│  SiteNavbar (existing)                                 │
├────────────┬──────────────────────────┬───────────────┤
│  Sidebar   │      MDX content         │  TOC          │
│  240px     │      max-w-2xl           │  200px        │
│  (lazy)    │      prose               │  (lazy)       │
│  sticky    │                          │  sticky       │
├────────────┴──────────────────────────┴───────────────┤
│  prev / next doc links (inferred from docsNav order)   │
└───────────────────────────────────────────────────────┘
```

**Notes:**

- Background: `bg-surface-950`
- Content area has `max-w-none prose-invert` feel but styled by `MdxComponents` (not Tailwind prose plugin)
- `SiteNavbar` already exists — just import it, pass `variant="standard"`

**Acceptance:**

- Layout holds at 320px, 768px, 1280px
- Sidebar and TOC sticky-scroll independently
- No CLS from lazy sidebar

---

### ITEM 10 — `src/app/docs/page.tsx` — Docs index redirect

**Priority:** P0  
**Effort:** XS  
**Files changed:** `src/app/docs/page.tsx` (new)

**Behaviour:** `redirect('/docs/introduction')` — sends user to first doc rather than a blank page.

---

### ITEM 11 — `src/app/docs/[slug]/page.tsx` — Individual doc page

**Priority:** P0  
**Effort:** M  
**Risk:** Low  
**Files changed:** `src/app/docs/[slug]/page.tsx` (new)  
**Note:** Must support nested slugs → use catch-all `[...slug]`

**Responsibilities:**

- `generateStaticParams()` — returns all slugs from `getAllDocSlugs()`
- `generateMetadata()` — uses `frontmatter.title` + `frontmatter.description`
- Reads doc, extracts headings (for TOC prop), compiles MDX
- Passes `headings` to `<TableOfContents>`
- Renders `{content}` (compiled MDX JSX)

**Acceptance:**

- `/docs/introduction` loads
- `/docs/api/atoms` (nested) loads
- `<title>` in `<head>` matches frontmatter title
- 404 for unknown slugs

---

### ITEM 12 — `src/app/blog/layout.tsx` — Blog shell

**Priority:** P1  
**Effort:** S  
**Files changed:** `src/app/blog/layout.tsx` (new)

**Design:** Simple — `SiteNavbar` + centred content + footer. No sidebar. Full-width feel.

---

### ITEM 13 — `src/app/blog/page.tsx` — Blog index (card grid)

**Priority:** P1  
**Effort:** M  
**Files changed:** `src/app/blog/page.tsx` (new)

**Design:**

- Page heading: "From the team" + subheading
- `getAllPosts()` called server-side
- Card grid: 3 columns desktop, 2 tablet, 1 mobile
- Card contains: date badge, title, excerpt, reading time, tags (if any), "Read more →" link
- Cards use `bg-surface-900 border border-surface-800 rounded-2xl hover:border-brand-500/50 transition` style

**Acceptance:**

- Cards link to `/blog/[slug]`
- Empty state message if no posts
- Sorted newest-first

---

### ITEM 14 — `src/app/blog/[slug]/page.tsx` — Individual blog post

**Priority:** P1  
**Effort:** M  
**Files changed:** `src/app/blog/[slug]/page.tsx` (new)

**Design:**

- Centred narrow column (`max-w-2xl mx-auto`)
- Hero: date, tags, title (3xl+), author, reading time
- MDX body via same `MdxComponents`
- "← Back to blog" link at top and bottom

**Acceptance:**

- `generateMetadata()` from frontmatter
- 404 for unknown slugs
- Code blocks highlighted

---

### ITEM 15 — `SiteNavbar` — Wire Docs and Blog links

**Priority:** P0  
**Effort:** XS  
**Files changed:** `src/components/ui/SiteNavbar.tsx`

**Change:** Update nav items array — existing "Docs" entry already points somewhere; change href to `/docs`. Add "Blog" item with href `/blog`.

**Acceptance:**

- `/docs` highlighted active when on docs pages
- `/blog` highlighted active when on blog pages

---

### ITEM 16 — Sample content (MDX files)

**Priority:** P0 — needed to validate the pipeline end-to-end  
**Effort:** S  
**Files changed:** `content/docs/introduction.mdx`, `content/docs/quick-start.mdx`, `content/blog/2026-04-03-welcome.mdx`

**Purpose:** Functional placeholder content that exercises all MDX components — headings, code blocks with titles and highlights, callouts, tables, inline code.

---

### ITEM 17 — Validate: typecheck + dev build

**Priority:** P0  
**Effort:** XS  
**Files changed:** None

**Commands:**

```bash
npm run typecheck
npm run dev
```

Check:

- No TS errors
- `/docs`, `/docs/introduction`, `/blog`, `/blog/2026-04-03-welcome` all load
- Code blocks highlighted
- Sidebar active state correct
- Mobile layout correct

---

## Execution Order

```
1  → install rehype-pretty-code           (ITEM 1)
2  → docs-nav config                      (ITEM 2)
3  → lib/mdx.ts + lib/docs.ts + lib/blog.ts  (ITEMS 3–5, parallel)
4  → MdxComponents                        (ITEM 6)
5  → DocsSidebar + TableOfContents        (ITEMS 7–8, parallel)
6  → app/docs layout + pages              (ITEMS 9–11)
7  → app/blog layout + pages              (ITEMS 12–14)
8  → SiteNavbar update                    (ITEM 15)
9  → sample content                       (ITEM 16)
10 → typecheck + smoke test               (ITEM 17)
```

---

## Out of Scope (v1)

- Search (Algolia / local fuse.js) — future sprint
- Comments on blog posts
- RSS feed
- Dark/light toggle (dark-only for now)
- Pagination on blog index (< 20 posts initially)
- Versioned docs
