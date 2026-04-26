/**
 * HeroVideo — full-bleed background video for the landing-page hero.
 *
 * Why this is a server component (no "use client"):
 *   The <video> element manages its own playback state via native browser
 *   APIs. We don't need React state. Keeping this server-side means zero
 *   JS shipped to the client for the hero behaviour, which protects LCP
 *   and TBT — both of which the previous R3F hero tanked (37+s TBT).
 *
 * Loading strategy (sprint 2026-W17):
 *   1. The poster JPEG (~190 KB) paints instantly — this becomes the LCP
 *      candidate. Browsers show it before the video buffers.
 *   2. <source media="(max-width: 768px)"> swaps to a 720px-wide variant
 *      on phones (~290 KB). Mobile users never download the desktop file.
 *   3. preload="auto" because this is the most-important above-the-fold
 *      asset; we want it ready to play as soon as the page renders.
 *   4. autoPlay + muted + playsInline is the magic combo for mobile
 *      autoplay (Safari + Chrome both honour it).
 *   5. loop because the source is a 19.8s clip designed to repeat.
 *   6. Audio was stripped at encode time (`ffmpeg -an`) so the file is
 *      smaller AND there's nothing to mute. The `muted` attribute is
 *      kept anyway for autoplay compatibility.
 *   7. aria-hidden because the video is purely decorative — the slogan
 *      lives in HeroAnimatedSequence as accessible DOM text.
 *   8. The poster doubles as a fallback when JS is disabled or the video
 *      codec isn't supported (rare today — H.264 has near-100% support).
 *
 * Layout:
 *   - absolute inset-0 makes it fill the parent <section>.
 *   - object-cover preserves aspect ratio while filling the box.
 *   - Tailwind doesn't have a `pointer-events-none` requirement here, but
 *     the click events on the surrounding DOM should reach the CTAs above.
 */

export function HeroVideo() {
  return (
    <video
      data-testid="hero-video"
      // Required for autoplay on every modern browser:
      autoPlay
      muted
      loop
      playsInline
      // Eager fetch — this is the LCP-adjacent asset.
      preload="auto"
      // Static placeholder — paints first, becomes LCP candidate. Falls
      // back to this if the video fails to play (codec error, network).
      poster="/hero/hero-poster.jpg"
      // Decorative — the slogan is in DOM via HeroAnimatedSequence.
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
    >
      {/* Mobile variant — 720px wide, ~290 KB. Browsers pick the FIRST
          source they can play whose `media` matches. So mobile users
          download only this one file. */}
      <source src="/hero/hero-mobile.mp4" type="video/mp4" media="(max-width: 768px)" />
      {/* Desktop variant — 1600px wide, ~3 MB. */}
      <source src="/hero/hero-desktop.mp4" type="video/mp4" />
      {/* No <source> for WebM: the H.264 MP4 has near-100% browser
          support and a single-format setup avoids dead-weight files in
          the public folder. If a future encode pass produces a
          significantly smaller VP9/AV1 variant, add it as a higher-
          priority <source> above the MP4 ones. */}
    </video>
  );
}
