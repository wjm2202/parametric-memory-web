# Sprint: Landing Page V2 — Scroll-Driven Animation Redesign

**Created:** 2026-03-16
**Status:** Planning
**Deploy target:** parametric-memory.dev (landing page only — no changes to /visualise)

---

## Overview

Replace the current static hero landing page with an Apple-style, scroll-driven animated experience. The page will use pre-rendered animation frames played back via scroll position, combined with parallax text sections and cinematic transitions.

**Inspiration workflow:** AI-generated product animation → frame extraction → scroll-locked playback
**Our stack:** Claude Cowork + Next.js + Tailwind + canvas/R3F — no external deploy tools needed

---

## Phase 0: Design Sprint (BLOCKING — do this first)

### 0.1 — Decide the Hero Animation Concept
**Discussion needed.** What does the viewer see as they scroll?

Options to discuss:

- **A) Merkle Tree Assembly** — Camera starts on empty void. As user scrolls, a Merkle tree builds itself node-by-node, hashing upward. Atoms appear as glowing particles that settle into tree positions. Final frame = the full tree with root hash glowing.

- **B) Memory Crystallisation** — Abstract neural/memory particles swirl in chaos. On scroll they coalesce into the hash ring structure (like the /visualise page but cinematic). Shards light up, atoms dock into position, Markov arcs trace between them.

- **C) Data Flow Journey** — Follow a single piece of data: API call arrives → atom created → hashed → placed in tree → Markov weights update → prediction arc fires. Tells the product story through animation.

- **D) Geometric Unfolding** — Inspired by Apple product reveals. Start with the MMPM logo/icon, which unfolds/explodes into component pieces (ring, tree, atoms, arcs) that arrange themselves into the product architecture diagram.

- **E) Hybrid** — Combine elements. E.g., crystallisation hero → scroll into feature sections with mini-animations for each capability.

### 0.2 — Decide Animation Production Method
Options:

1. **AI-Generated Video → Frame Extraction** (from the guide)
   - Use Google Whisk / FreePik AI / Veo Flow to generate a 10s cinematic video
   - Extract frames at 25fps with EZGif (~250 frames)
   - Scroll-lock playback via canvas
   - Pros: Stunning visuals, fast to produce
   - Cons: Large asset size (~15-30MB), less interactive, harder to iterate

2. **Real-time Three.js / R3F Animation**
   - Build the animation in code using React Three Fiber (we already have R3F in the project)
   - Scroll position drives animation progress via useScroll/useMotion
   - Pros: Interactive, small bundle, can respond to user input, matches /visualise tech
   - Cons: More development time, needs careful performance tuning

3. **Hybrid: R3F hero + AI-generated accent videos**
   - Core animation in R3F (scroll-driven)
   - AI-generated video clips for section backgrounds or transitions
   - Best of both worlds

### 0.3 — Page Structure & Sections
Decide what sections appear as user scrolls down:

```
┌─────────────────────────────────────────┐
│  HERO: Full-viewport animation          │
│  "Parametric Memory"                    │
│  Tagline fades in on scroll             │
├─────────────────────────────────────────┤
│  SECTION 1: What is it?                 │
│  Brief explanation + mini animation     │
├─────────────────────────────────────────┤
│  SECTION 2: Key Features (3-4 cards)    │
│  Merkle proofs / Markov prediction /    │
│  Sub-ms recall / Cryptographic audit    │
├─────────────────────────────────────────┤
│  SECTION 3: How it works               │
│  Scroll-driven technical diagram        │
├─────────────────────────────────────────┤
│  SECTION 4: Live Demo link             │
│  → /visualise                          │
├─────────────────────────────────────────┤
│  SECTION 5: Pricing / CTA              │
│  → /pricing + /docs                    │
├─────────────────────────────────────────┤
│  FOOTER                                │
└─────────────────────────────────────────┘
```

### 0.4 — Color & Design Language
Current palette: dark (`surface-950`), cyan brand (`brand-400/500`), amber accents.
Discuss: keep current palette or evolve it?

---

## Phase 1: Asset Generation

### 1.1 — Generate Hero Animation Assets
Based on Phase 0 decisions:
- If **AI video path**: Generate video with chosen AI tool → extract frames → optimize
- If **R3F path**: Design the 3D scene, geometry, materials, and scroll keyframes
- If **Hybrid**: Both of the above

### 1.2 — Prepare Static Assets
- Product logo / icon (SVG, high-res)
- Section illustrations or diagrams
- Any accent videos or particle textures

### 1.3 — Optimize Assets
- Compress frames (WebP, quality 80, max 1920px wide)
- Lazy-load below-fold images
- Target: hero animation < 5MB total, full page < 10MB

---

## Phase 2: Page Scaffold

### 2.1 — Scroll Infrastructure
- Install/configure scroll library (framer-motion `useScroll` or GSAP ScrollTrigger or Lenis)
- Set up scroll-progress tracking (0→1 mapped to page sections)
- Smooth scrolling with momentum

### 2.2 — Section Layout
- Build responsive section containers
- Sticky hero viewport for animation playback
- Parallax text reveals with fade/slide transitions

### 2.3 — Navigation Updates
- Update nav for new page structure (scroll-aware active states?)
- Mobile hamburger if needed
- Keep existing routes (/docs, /pricing, /visualise) intact

---

## Phase 3: Hero Animation

### 3.1 — Frame Playback Engine (if AI video path)
- Canvas element fills viewport
- Preload frames progressively (first 30 immediate, rest lazy)
- Map scroll position → frame index
- requestAnimationFrame render loop, only paint on frame change

### 3.2 — R3F Scroll Scene (if R3F path)
- Scene with scroll-driven camera/animation progress
- Geometry + materials matching design decisions
- Performance: target 60fps on mid-range laptop
- Fallback: static image for low-power devices

### 3.3 — Text Overlays on Hero
- Title + tagline appear/disappear based on scroll progress
- CSS mix-blend-mode or glassmorphism panels
- Typography: large, bold, tracking-tight (match current style)

---

## Phase 4: Content Sections

### 4.1 — Feature Cards
- 3-4 key capabilities with icons and short descriptions
- Scroll-triggered entrance animations (fade-up, stagger)
- Optional: mini Three.js scenes per card (e.g., spinning Merkle proof)

### 4.2 — "How It Works" Section
- Technical diagram or animated flow
- Could be SVG animation or R3F scene
- Scroll-driven progressive reveal

### 4.3 — Live Demo CTA
- Embedded preview of /visualise or screenshot with play button
- Link to /visualise

### 4.4 — Pricing / Docs CTA
- Clean CTA section with buttons to /pricing and /docs
- Version badge (current: v0.1.1)

---

## Phase 5: Polish & Ship

### 5.1 — Responsive Design
- Mobile: simplified animation (fewer frames or static fallback)
- Tablet: scaled layout
- Desktop: full experience

### 5.2 — Performance Audit
- Lighthouse score target: 90+ performance
- Largest Contentful Paint < 2.5s
- Total bundle size budget
- Preload critical assets, defer rest

### 5.3 — Accessibility
- Reduced motion: respect `prefers-reduced-motion`
- Semantic HTML sections
- Keyboard navigation
- Alt text for visual content

### 5.4 — Deploy
- Build and test locally
- Push to main
- SSH deploy to parametric-memory.dev (existing CI/CD pipeline)

---

## Constraints

- **No changes to /visualise** this sprint — simulation page is frozen
- **Existing routes preserved** — /docs, /pricing, /blog, /developers, /contact all stay
- **Same Next.js project** — no separate repo, builds alongside existing pages
- **Dark theme** — matches current brand, no light mode this sprint

---

## Open Questions for Design Sprint

1. Which hero animation concept? (A/B/C/D/E from 0.1)
2. AI video frames vs real-time R3F vs hybrid?
3. How many scroll-lengths for the full page? (Apple typically does 5-8x viewport)
4. Any reference sites we want to match the feel of?
5. Copy/messaging: keep current tagline or write new?
6. Do we want sound/audio on scroll? (risky but impactful)
7. Mobile strategy: degraded animation or completely different layout?
