# MMPM Product Explainer Video

50-second Remotion composition (1920×1080, 30fps, 1500 frames).

## Scenes

| # | Scene | Duration | Key message |
|---|-------|----------|-------------|
| 1 | The Pain | 8s | AI amnesia — every session starts from zero |
| 2 | The Substrate | 8s | Memory that proves itself — live stats |
| 3 | Use Cases | 9s | Dev, Ops, Business — not just for code |
| 4 | The Proof | 8s | Merkle verification — math, not faith |
| 5 | Taglines | 10s | 5 taglines cycling — 2s each |
| 6 | The Close | 7s | Logo reveal + CTA + URL |

## Quick start

```bash
cd mmpm-website/video
npm install
npm run studio       # Open Remotion Studio at localhost:3000
```

## Render to MP4

```bash
npm run render       # → out/mmpm-explainer.mp4  (full 50s, H.264)
npm run render:short # → out/mmpm-short.mp4      (first 10s only)
npm run render:gif   # → out/mmpm-preview.gif    (half-size GIF preview)
```

## Customising taglines

Edit `src/scenes/SceneTaglines.tsx` — the `TAGLINES` array.
Each tagline has `line1` (white) and `line2` (gradient).
Duration is 2s each (60 frames). Change `FRAMES_PER_TAGLINE` to adjust.

## Adjusting timing

All scene durations and start frames are in `src/MMPMVideo.tsx` under the `SCENE` constant.
`VIDEO_DURATION_FRAMES` must equal the sum of all durations.

## Embedding in the landing page

After rendering, copy `out/mmpm-explainer.mp4` to `../public/videos/mmpm-explainer.mp4`.
Then add to `page.tsx`:

```tsx
<video
  autoPlay
  muted
  loop
  playsInline
  src="/videos/mmpm-explainer.mp4"
  style={{ width: "100%", borderRadius: 16 }}
/>
```
