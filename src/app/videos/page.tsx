import type { Metadata } from "next";
import Link from "next/link";
import { getAllVideos, formatDuration, youtubeThumbnailUrl, type VideoMeta } from "@/lib/videos";
import { buildVideoItemList } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Videos",
  description:
    "Walkthroughs and demos of Parametric Memory — persistent, verifiable AI memory over MCP. Watch an agent recall from memory alone, query six months of CVEs, and share a TypeScript expert memory across a fleet of coding agents.",
  alternates: { canonical: "https://parametric-memory.dev/videos" },
  keywords: [
    "AI memory demo",
    "MCP memory server video",
    "agent memory walkthrough",
    "parametric memory video",
    "persistent memory for AI agents",
  ],
  openGraph: {
    title: "Videos | Parametric Memory",
    description:
      "Walkthroughs and demos of Parametric Memory — persistent, verifiable AI memory over MCP.",
    url: "https://parametric-memory.dev/videos",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory videos",
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

// ── Video card ───────────────────────────────────────────────────────────────

function VideoCard({ video }: { video: VideoMeta }) {
  const date = new Date(video.uploadDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      href={`/videos/${video.slug}`}
      data-testid={`videos-card-${video.slug}`}
      className="group border-surface-800 bg-surface-900 hover:border-brand-500/40 hover:bg-surface-800/60 flex flex-col overflow-hidden rounded-2xl border transition-all"
    >
      {/* Thumbnail. Plain <img> rather than next/image: the source is Google's
          own CDN and adding a remotePattern to next.config just to proxy an
          already-optimised YouTube still is cost without benefit. */}
      <div className="bg-surface-800 relative aspect-video overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={youtubeThumbnailUrl(video.youtubeId)}
          alt=""
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="bg-surface-950/85 text-surface-200 absolute right-2 bottom-2 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums">
          {formatDuration(video.durationSeconds)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <time dateTime={video.uploadDate} className="text-surface-500 mb-3 font-mono text-[11px]">
          {date}
        </time>

        <h2 className="font-display text-surface-100 mb-2 text-lg leading-snug font-semibold transition-colors group-hover:text-white">
          {video.title}
        </h2>

        <p className="text-surface-400 mb-4 line-clamp-3 flex-1 text-sm leading-relaxed">
          {video.description}
        </p>

        <div className="border-surface-800 mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap gap-1.5">
            {video.tags.slice(0, 3).map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
          <span className="text-brand-400 shrink-0 text-sm font-medium transition-transform group-hover:translate-x-1">
            Watch →
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VideosIndexPage() {
  const videos = getAllVideos();
  const itemListJsonLd = buildVideoItemList(videos);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-14">
          <p className="text-brand-400 mb-3 font-mono text-xs tracking-widest uppercase">
            Watch it work
          </p>
          <h1 className="font-display mb-4 text-4xl font-bold text-white">Videos</h1>
          <p className="text-surface-400 max-w-xl">
            Demos and walkthroughs of Parametric Memory in use — an agent recalling from memory
            alone, six months of CVEs queried without re-reading a single advisory, and a shared
            expert memory for a fleet of coding agents.
          </p>
        </div>

        {videos.length === 0 ? (
          <div className="border-surface-800 rounded-2xl border border-dashed py-24 text-center">
            <p className="text-surface-600 font-mono text-sm">No videos yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <VideoCard key={video.slug} video={video} />
            ))}
          </div>
        )}

        <div className="border-surface-800 mt-16 border-t pt-8">
          <p className="text-surface-500 text-sm">
            More on the{" "}
            <a
              href="https://www.youtube.com/@parametricmemory"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="videos-youtube-channel"
              className="text-brand-400 hover:text-brand-300 underline underline-offset-4"
            >
              Parametric Memory YouTube channel
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
