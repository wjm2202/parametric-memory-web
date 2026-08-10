/**
 * Video catalogue — single source of truth for /videos and /videos/[slug].
 *
 * Why a TS module and not MDX:
 *   The video corpus is small, highly structured (id, duration, upload date,
 *   chapter offsets), and every field feeds VideoObject JSON-LD. Frontmatter
 *   would make the schema-critical fields untyped and unvalidated. A typed
 *   module lets `videos.test.ts` assert the invariants Google's video
 *   indexing actually cares about — a missing `durationSeconds` or a
 *   mistyped `uploadDate` is a build error, not a silent rich-result loss.
 *
 * Why the site hosts video pages at all (2026-08-09 GSC audit):
 *   parametric-memory.dev averaged position 11.6 with a rising impression
 *   curve — page-two visibility for essentially every query. Video results
 *   are a materially less contested SERP than web results, and Google grants
 *   them to pages where the video is the MAIN content. Three focused pages
 *   are eligible; one combined gallery page is not. The sitemap also reported
 *   "Discovered videos: 0" because the site published no video markup at all.
 *
 * ADDING A VIDEO
 *   1. Append an entry to `VIDEOS` below (newest last — order here is
 *      authoring order; `getAllVideos()` sorts by uploadDate descending).
 *   2. Add its `lastmod` to VIDEO_LASTMOD in src/app/sitemap.ts.
 *   3. That's it — the hub, the detail route, generateStaticParams, the
 *      sitemap entries and the JSON-LD all derive from this array.
 *
 * CHAPTERS
 *   Optional. Supply them ONLY when the YouTube video genuinely has those
 *   chapter markers — `hasPart`/Clip schema tells Google the offsets are real
 *   and it will surface them as key moments. Inventing offsets that don't
 *   match the video is a rich-result violation, not a shortcut.
 */

export interface VideoChapter {
  /** Offset from the start of the video, in seconds. */
  startSeconds: number;
  title: string;
}

export interface VideoRelatedLink {
  href: string;
  label: string;
}

export interface VideoMeta {
  /** URL segment under /videos/ — kebab-case, stable, never reused. */
  slug: string;
  /** YouTube video id (the `v` query parameter). */
  youtubeId: string;
  /** On-page H1 and schema.org `name`. */
  title: string;
  /**
   * Short title for the <title> tag. The root layout appends
   * " | Parametric Memory", so keep this under ~55 characters.
   */
  seoTitle: string;
  /** Meta description and schema.org `description`. One or two sentences. */
  description: string;
  /** On-page prose, one string per paragraph. */
  summary: string[];
  /** "What you'll see" bullets — scannable, indexable, concrete. */
  takeaways: string[];
  /** Runtime in whole seconds. Drives both the UI label and ISO-8601 duration. */
  durationSeconds: number;
  /** Publication date, YYYY-MM-DD. Feeds schema `uploadDate` and the UI. */
  uploadDate: string;
  /** Real YouTube chapter markers, if the video has them. */
  chapters?: VideoChapter[];
  /** Internal links — the whole point of the page for site-architecture purposes. */
  relatedLinks: VideoRelatedLink[];
  /** Surfaced as pills in the UI and as schema `keywords`. */
  tags: string[];
}

/**
 * Authoring order. Do not sort this array by hand — `getAllVideos()` sorts by
 * `uploadDate` descending so display order can never drift from reality.
 */
const VIDEOS: readonly VideoMeta[] = [
  {
    slug: "cve-memory-for-ai-agents",
    youtubeId: "-CgndsNAejQ",
    title: "I gave Claude a memory of every CVE from the last six months",
    seoTitle: "CVE memory for AI agents",
    description:
      "Six months of CVEs loaded into a Parametric Memory substrate, then queried by an AI agent to answer which vulnerabilities actually affect a given stack — answered from memory, without re-reading advisories.",
    summary: [
      "A common first reaction to MMPM is that agent memory is a coding-assistant feature. This walkthrough is the counter-example: the substrate is loaded with six months of published CVEs for a real technology stack, and the agent is then asked which of them affect us.",
      "The answer comes out of memory. No advisory feeds are re-read at query time and no vulnerability data is pasted into the prompt. The retrieval step is the whole interaction.",
      "The point is not the lookup — it is that the substrate is a shared asset. Ingest the vulnerability intelligence once and every project queries the same memory. Across an estate of fifty repositories, the fiftieth check costs close to nothing because the knowledge is already resident. That is what makes memory an unusual piece of infrastructure: the per-use cost falls as usage rises, where a context window only gets more expensive.",
      "None of this is specific to CVEs. Any body of knowledge you care about can be ingested the same way.",
    ],
    takeaways: [
      "CVEs stored as atoms with typed edges (affects, supersedes, member_of) in a dedicated vulnerability-intelligence domain",
      "Every atom committed to a SHA-256 Merkle tree, so a read carries a proof that the memory was not altered after the fact",
      "A Markov chain prefetches likely-next reads, so most recalls are already warm when the agent asks",
      "Exposed as an MCP server — one configuration block, and it works with Claude, Claude Code, Cursor, Cline and any other MCP client",
      "Unused paths decay rather than accumulating, so relevance does not rot as the store grows",
    ],
    durationSeconds: 257,
    uploadDate: "2026-07-13",
    relatedLinks: [
      { href: "/docs/introduction", label: "What is Parametric Memory?" },
      { href: "/verify", label: "Verify a memory snapshot yourself" },
      { href: "/pricing", label: "Pricing" },
    ],
    tags: ["CVE", "vulnerability intelligence", "MCP", "AI memory"],
  },
  {
    slug: "ai-memory-over-mcp",
    youtubeId: "NW-ILHDd9rA",
    title: "I asked Claude for its own project history — from AI memory over MCP only",
    seoTitle: "AI memory over MCP: recall with no context",
    description:
      "Claude is given a persistent memory substrate over MCP and asked to recall the history of its own project using memory alone — no context, no RAG. It reports what it does not know and cites a tombstoned atom to prove it.",
    summary: [
      "An agent is connected to a Parametric Memory substrate over MCP and then asked, using memory alone, to recount the history of the project it has been working on. No documents are supplied, no retrieval-augmented pipeline is involved, and nothing is pasted into the context window.",
      "What comes back at 3:55 is the part worth watching. The agent reports not only what it remembers but what it cannot know — the substrate's record begins on a specific date, and an atom that had claimed an earlier launch was tombstoned. It cites the tombstone as evidence. An agent that can distinguish 'I do not know' from 'this did not happen' is behaving very differently from one that confabulates to fill a gap.",
      "The second half walks through what the same substrate does day to day: re-establishing context in a fresh coding session, backing operational work, and holding a knowledge store whose value compounds as it grows.",
    ],
    takeaways: [
      "Recall performed entirely over MCP tool calls, with no context priming and no RAG pipeline",
      "Tombstoned atoms let the agent state what it does not know, and show why",
      "Knowledge stored as atoms with typed edges, committed to a SHA-256 Merkle tree so every read carries a proof",
      "Three worked use cases: re-contexting a coding session, an operations substrate, and a compounding knowledge store",
      "Ingest once, query from every project — the marginal cost of the next check approaches zero",
    ],
    durationSeconds: 790,
    uploadDate: "2026-07-13",
    chapters: [
      { startSeconds: 0, title: "Intro" },
      { startSeconds: 7, title: "The premise: AI memory over MCP, nothing else" },
      { startSeconds: 115, title: "The prompt — give me the history of the substrate" },
      { startSeconds: 150, title: "Claude searches its own memory (MCP tool calls)" },
      { startSeconds: 235, title: "What it remembers — and what it cannot (tombstoned atoms)" },
      {
        startSeconds: 400,
        title: "Use case 1: an L2 cache for coding, re-contexting a new session",
      },
      { startSeconds: 580, title: "Use case 2: an operations substrate" },
      { startSeconds: 670, title: "Use case 3: a knowledge store that compounds" },
    ],
    relatedLinks: [
      { href: "/docs/mcp/claude", label: "Connect MMPM to Claude over MCP" },
      { href: "/verify", label: "Verify a memory snapshot yourself" },
      { href: "/benchmark", label: "LongMemEval-S results" },
    ],
    tags: ["MCP", "AI memory", "Claude", "tombstones", "Merkle proofs"],
  },
  {
    slug: "typescript-expert-memory-l2-cache",
    youtubeId: "wDnnzp9Bz0U",
    title: "Building a TypeScript expert memory as an L2 cache for a fleet of coding agents",
    seoTitle: "A TypeScript expert memory for coding agents",
    description:
      "A full build: Claude researches TypeScript standards, ingests them into a Parametric Memory substrate, and that substrate then acts as a shared L2 cache so a fleet of agents writes to a consistent expert standard.",
    summary: [
      "This is the long-form build. Rather than describing the idea, it runs the whole thing end to end: an agent researches current TypeScript standards and practice, that research is ingested into a Parametric Memory substrate, and the substrate is then wired in as a shared L2 cache for a fleet of coding agents.",
      "The problem it addresses is consistency. A fleet of agents working from their own context windows produces a fleet of different house styles, and the drift compounds across a codebase. A shared memory gives every agent the same expert baseline to write against, and the baseline improves as it is corrected rather than being re-derived from scratch each session.",
      "At just over half an hour this is the closest thing to a full implementation walkthrough on the channel — worth watching if you want to see the ingestion and recall steps rather than the summary of them.",
    ],
    takeaways: [
      "Researching a body of standards with an agent, then ingesting the result as durable memory rather than discarding it with the session",
      "Wiring a substrate in as a shared L2 cache across multiple agents",
      "Why consistency across an agent fleet is a memory problem before it is a prompting problem",
      "The full ingestion and recall path, shown rather than summarised",
    ],
    durationSeconds: 1943,
    uploadDate: "2026-08-09",
    relatedLinks: [
      { href: "/docs/introduction", label: "What is Parametric Memory?" },
      { href: "/docs/your-instance", label: "Your instance and API key" },
      { href: "/pricing", label: "Pricing" },
    ],
    tags: ["TypeScript", "coding agents", "L2 cache", "AI memory", "MCP"],
  },
] as const;

/** All videos, newest first. */
export function getAllVideos(): VideoMeta[] {
  return [...VIDEOS].sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
}

/** Slugs in the same order as `getAllVideos()`. Used by generateStaticParams + sitemap. */
export function getAllVideoSlugs(): string[] {
  return getAllVideos().map((video) => video.slug);
}

/** Look up one video. Returns undefined for an unknown slug so callers can 404. */
export function getVideoBySlug(slug: string): VideoMeta | undefined {
  return VIDEOS.find((video) => video.slug === slug);
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Human-readable runtime: 257 → "4:17", 1943 → "32:23", 3725 → "1:02:05".
 * Minutes and seconds are zero-padded only when a larger unit precedes them.
 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * ISO-8601 duration for schema.org `duration`: 257 → "PT4M17S".
 * Zero-valued components are omitted; a zero duration yields "PT0S".
 */
export function toIso8601Duration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "PT0S";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `PT${hours > 0 ? `${hours}H` : ""}${minutes > 0 ? `${minutes}M` : ""}${
    seconds > 0 ? `${seconds}S` : ""
  }`;
}

// ── YouTube URL helpers ──────────────────────────────────────────────────────

/**
 * Player URL. youtube-nocookie.com is used deliberately: the standard embed
 * domain sets third-party cookies on page load, which would require a new row
 * in the cookie table in /privacy and arguably a consent gate. The nocookie
 * domain is Google-operated and indexes identically, so the schema `embedUrl`
 * and the on-page iframe `src` are the same URL — Google matches the markup to
 * the player it can see.
 */
export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
}

/** Canonical watch URL on YouTube. Used for outbound links and chapter deep-links. */
export function youtubeWatchUrl(youtubeId: string, startSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${youtubeId}`;
  return startSeconds && startSeconds > 0 ? `${base}&t=${startSeconds}` : base;
}

/**
 * Thumbnail on Google's own CDN. `thumbnailUrl` is a required property for
 * VideoObject rich results, and i.ytimg.com is guaranteed crawlable.
 */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;
}
