import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllVideoSlugs,
  getVideoBySlug,
  formatDuration,
  toIso8601Duration,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
} from "@/lib/videos";
import { buildVideoObject, buildVideoBreadcrumb } from "@/lib/structured-data";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllVideoSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const video = getVideoBySlug(slug);
  if (!video) return { title: "Videos" };

  const url = `https://parametric-memory.dev/videos/${video.slug}`;
  return {
    // Short SEO title — the root layout appends " | Parametric Memory".
    title: video.seoTitle,
    description: video.description,
    alternates: { canonical: url },
    keywords: video.tags,
    openGraph: {
      title: video.title,
      description: video.description,
      url,
      type: "video.other",
      images: [
        {
          url: youtubeThumbnailUrl(video.youtubeId),
          width: 1280,
          height: 720,
          alt: video.title,
        },
      ],
    },
  };
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

export default async function VideoPage({ params }: PageProps) {
  const { slug } = await params;
  const video = getVideoBySlug(slug);
  if (!video) notFound();

  const videoJsonLd = buildVideoObject({
    slug: video.slug,
    title: video.title,
    description: video.description,
    uploadDate: video.uploadDate,
    duration: toIso8601Duration(video.durationSeconds),
    durationSeconds: video.durationSeconds,
    thumbnailUrl: youtubeThumbnailUrl(video.youtubeId),
    embedUrl: youtubeEmbedUrl(video.youtubeId),
    keywords: video.tags,
    chapters: video.chapters,
  });
  const breadcrumbJsonLd = buildVideoBreadcrumb(video.title);

  const date = new Date(video.uploadDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Link
          href="/videos"
          data-testid="video-back-to-videos"
          className="text-surface-500 hover:text-brand-400 mb-8 inline-flex items-center gap-1 font-mono text-xs transition-colors"
        >
          ← All videos
        </Link>

        <header className="mb-8">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <time dateTime={video.uploadDate} className="text-surface-500 font-mono text-[11px]">
              {date}
            </time>
            <span className="text-surface-700">·</span>
            <span className="text-surface-500 font-mono text-[11px] tabular-nums">
              {formatDuration(video.durationSeconds)}
            </span>
          </div>

          <h1 className="font-display mb-4 text-3xl leading-tight font-bold text-white sm:text-4xl">
            {video.title}
          </h1>

          <p className="text-surface-400 leading-relaxed">{video.description}</p>
        </header>

        {/* Player. The iframe src and the schema embedUrl are the same URL so
            Google can match the markup to the player it sees on the page. */}
        <div className="border-surface-800 bg-surface-900 mb-10 aspect-video overflow-hidden rounded-2xl border">
          <iframe
            src={youtubeEmbedUrl(video.youtubeId)}
            title={video.title}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
            data-testid="video-player"
          />
        </div>

        <section className="mb-10">
          <h2 className="font-display mb-4 text-xl font-semibold text-white">About this video</h2>
          <div className="space-y-4">
            {video.summary.map((paragraph, i) => (
              <p key={i} className="text-surface-300 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-display mb-4 text-xl font-semibold text-white">
            What you&rsquo;ll see
          </h2>
          <ul className="space-y-3">
            {video.takeaways.map((item) => (
              <li key={item} className="text-surface-300 flex gap-3 leading-relaxed">
                <span className="text-brand-400 mt-1.5 shrink-0 text-[10px]">▸</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {video.chapters && video.chapters.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display mb-4 text-xl font-semibold text-white">Chapters</h2>
            <ol className="border-surface-800 divide-surface-800 divide-y rounded-2xl border">
              {video.chapters.map((chapter) => (
                <li key={chapter.startSeconds}>
                  <a
                    href={youtubeWatchUrl(video.youtubeId, chapter.startSeconds)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:bg-surface-800/60 flex items-baseline gap-4 px-5 py-3 transition-colors"
                  >
                    <span className="text-brand-400 shrink-0 font-mono text-xs tabular-nums">
                      {formatDuration(chapter.startSeconds)}
                    </span>
                    <span className="text-surface-300 text-sm leading-relaxed">
                      {chapter.title}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mb-10">
          <h2 className="font-display mb-4 text-xl font-semibold text-white">Go deeper</h2>
          <ul className="space-y-2">
            {video.relatedLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-brand-400 hover:text-brand-300 text-sm underline underline-offset-4"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="border-surface-800 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <div className="flex flex-wrap gap-1.5">
            {video.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
          <a
            href={youtubeWatchUrl(video.youtubeId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-surface-500 hover:text-brand-400 font-mono text-xs transition-colors"
          >
            Watch on YouTube ↗
          </a>
        </footer>
      </main>
    </>
  );
}
