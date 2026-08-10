/**
 * Video catalogue invariants (2026-08-09 GSC video-indexing sprint).
 *
 * Context: the site averaged position 11.6 on Web search with a rising
 * impression curve, and published zero video markup — GSC's sitemap report
 * read "Discovered videos: 0" while three demos on YouTube earned Search
 * impressions the site could not claim. Video results are a much less
 * contested SERP, but Google only grants them when the structured data is
 * complete and honest.
 *
 * Every field asserted here feeds VideoObject JSON-LD or the sitemap's
 * <video:video> extension. A silent regression in this data does not throw at
 * runtime — the page renders fine and the rich result quietly disappears.
 * Hence the belt-and-braces coverage.
 */

import { describe, it, expect } from "vitest";
import {
  getAllVideos,
  getAllVideoSlugs,
  getVideoBySlug,
  formatDuration,
  toIso8601Duration,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
} from "./videos";

describe("video catalogue — required fields", () => {
  const videos = getAllVideos();

  it("has at least one video", () => {
    expect(videos.length).toBeGreaterThan(0);
  });

  it("every video carries the fields Google requires for VideoObject", () => {
    // name, description, thumbnailUrl and uploadDate are REQUIRED properties.
    // duration + embedUrl are strongly recommended and derived from these.
    for (const video of videos) {
      expect(video.title, `${video.slug}: title`).toBeTruthy();
      expect(video.description, `${video.slug}: description`).toBeTruthy();
      expect(video.uploadDate, `${video.slug}: uploadDate`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(video.durationSeconds, `${video.slug}: durationSeconds`).toBeGreaterThan(0);
      expect(video.youtubeId, `${video.slug}: youtubeId`).toBeTruthy();
    }
  });

  it("uploadDate values are real, parseable dates", () => {
    for (const video of videos) {
      expect(Number.isNaN(new Date(video.uploadDate).getTime()), video.slug).toBe(false);
    }
  });

  it("no uploadDate is in the future", () => {
    // 24h slack for same-day publishes across timezones (site is authored in
    // NZ; the sitemap and schema are read in UTC).
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    for (const video of videos) {
      expect(new Date(video.uploadDate).getTime(), video.slug).toBeLessThanOrEqual(cutoff);
    }
  });

  it("slugs are unique, lowercase and URL-safe", () => {
    const slugs = videos.map((v) => v.slug);
    expect(new Set(slugs).size, "duplicate slug").toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug, `${slug} is not kebab-case`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("YouTube ids are unique — the same video must not be published twice", () => {
    const ids = videos.map((v) => v.youtubeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seoTitle stays short enough to survive SERP truncation", () => {
    // The root layout appends " | Parametric Memory" (20 chars). Google
    // truncates around 60; 55 leaves headroom for the suffix.
    for (const video of videos) {
      expect(video.seoTitle.length, `${video.slug}: "${video.seoTitle}"`).toBeLessThanOrEqual(55);
    }
  });

  it("descriptions are substantial enough to be usable as a meta description", () => {
    for (const video of videos) {
      expect(video.description.length, video.slug).toBeGreaterThan(70);
    }
  });

  it("every video has on-page prose and takeaways — no thin pages", () => {
    // Six of the site's pages already sit in GSC's "Crawled — currently not
    // indexed" bucket. Shipping three more thin pages would repeat that.
    for (const video of videos) {
      expect(video.summary.length, `${video.slug}: summary paragraphs`).toBeGreaterThanOrEqual(2);
      expect(video.takeaways.length, `${video.slug}: takeaways`).toBeGreaterThanOrEqual(3);
      expect(video.relatedLinks.length, `${video.slug}: relatedLinks`).toBeGreaterThanOrEqual(1);
      expect(video.tags.length, `${video.slug}: tags`).toBeGreaterThanOrEqual(1);
    }
  });

  it("related links are internal — this section exists to pass authority inward", () => {
    for (const video of videos) {
      for (const link of video.relatedLinks) {
        expect(link.href, `${video.slug} → ${link.href}`).toMatch(/^\//);
      }
    }
  });
});

describe("video catalogue — chapters", () => {
  it("chapter offsets are ascending, start at or after zero, and fit inside the video", () => {
    // Google renders key moments from Clip startOffset/endOffset. An offset
    // past the end of the video, or out of order, invalidates the whole set.
    for (const video of getAllVideos()) {
      if (!video.chapters) continue;
      let previous = -1;
      for (const chapter of video.chapters) {
        expect(chapter.startSeconds, `${video.slug}: negative offset`).toBeGreaterThanOrEqual(0);
        expect(
          chapter.startSeconds,
          `${video.slug}: offsets out of order at "${chapter.title}"`,
        ).toBeGreaterThan(previous);
        expect(
          chapter.startSeconds,
          `${video.slug}: "${chapter.title}" starts past the end of the video`,
        ).toBeLessThan(video.durationSeconds);
        expect(chapter.title.trim(), `${video.slug}: empty chapter title`).toBeTruthy();
        previous = chapter.startSeconds;
      }
    }
  });

  it("a video with chapters has more than one — a single chapter is not a chapter list", () => {
    for (const video of getAllVideos()) {
      if (!video.chapters) continue;
      expect(video.chapters.length, video.slug).toBeGreaterThan(1);
    }
  });
});

describe("getAllVideos / getVideoBySlug", () => {
  it("returns videos newest first", () => {
    const dates = getAllVideos().map((v) => v.uploadDate);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("getAllVideoSlugs matches getAllVideos order", () => {
    expect(getAllVideoSlugs()).toEqual(getAllVideos().map((v) => v.slug));
  });

  it("resolves a known slug", () => {
    const slug = getAllVideoSlugs()[0];
    expect(getVideoBySlug(slug)?.slug).toBe(slug);
  });

  it("returns undefined for an unknown slug so the route can 404", () => {
    expect(getVideoBySlug("no-such-video")).toBeUndefined();
  });

  it("does not expose the internal array for mutation", () => {
    const first = getAllVideos();
    first.pop();
    expect(getAllVideos().length).toBe(first.length + 1);
  });
});

describe("formatDuration", () => {
  it("formats sub-hour runtimes as m:ss", () => {
    expect(formatDuration(257)).toBe("4:17");
    expect(formatDuration(790)).toBe("13:10");
    expect(formatDuration(1943)).toBe("32:23");
  });

  it("formats hour-plus runtimes as h:mm:ss", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("zero-pads seconds but not the leading unit", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(9)).toBe("0:09");
  });
});

describe("toIso8601Duration", () => {
  it("emits the schema.org duration format", () => {
    expect(toIso8601Duration(257)).toBe("PT4M17S");
    expect(toIso8601Duration(790)).toBe("PT13M10S");
    expect(toIso8601Duration(1943)).toBe("PT32M23S");
  });

  it("includes an hours component when present", () => {
    expect(toIso8601Duration(3725)).toBe("PT1H2M5S");
  });

  it("omits zero-valued components", () => {
    expect(toIso8601Duration(3600)).toBe("PT1H");
    expect(toIso8601Duration(120)).toBe("PT2M");
    expect(toIso8601Duration(45)).toBe("PT45S");
  });

  it("degrades to PT0S rather than emitting an invalid bare PT", () => {
    expect(toIso8601Duration(0)).toBe("PT0S");
    expect(toIso8601Duration(-5)).toBe("PT0S");
  });
});

describe("YouTube URL helpers", () => {
  it("uses the nocookie player domain so no third-party cookie is set on load", () => {
    // The standard embed domain sets cookies, which would need a new row in
    // the cookie table in /privacy and arguably a consent gate.
    expect(youtubeEmbedUrl("abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
  });

  it("builds a canonical watch URL", () => {
    expect(youtubeWatchUrl("abc123")).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("appends a start offset for chapter deep-links, but not for zero", () => {
    expect(youtubeWatchUrl("abc123", 235)).toBe("https://www.youtube.com/watch?v=abc123&t=235");
    expect(youtubeWatchUrl("abc123", 0)).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("points thumbnails at Google's own CDN so they are always crawlable", () => {
    expect(youtubeThumbnailUrl("abc123")).toBe("https://i.ytimg.com/vi/abc123/maxresdefault.jpg");
  });
});
