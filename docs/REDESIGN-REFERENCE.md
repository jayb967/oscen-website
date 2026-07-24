# OSCEN Website Redesign -- Design Reference

Companion to `PROGRESS.md` (the phased build plan). This doc holds the investigation
findings and the visual targets. All reference images live in `docs/reference/`.
Consult this doc during every build phase.

Investigated 2026-07-24 with a live browser (screenshots captured at multiple scroll
positions) plus bundle analysis of both reference sites, and full audits of the current
site and the brain-viz module.

---

## 1. The humanoid target (the exact look to emulate)

Images: `reference/humanoid-target-fullbody.png`, `reference/humanoid-target-closeup.png`

What defines the look (from the two screenshots):

- **Body**: feminine EVE-style android, anatomically human proportions, matte
  porcelain-white/warm-gray surface. NOT glossy chrome, NOT mechanical-joint robot.
  Soft sheen like satin-finished ceramic or automotive primer.
- **Panel seams**: thin dark seam lines carve the shell into organic panels (chest
  plates, abdominal hexagon, thigh guards, shoulder caps). Seams are the main surface
  detail -- no rivets, no exposed wiring except subtle darker joint gaps at elbows,
  armpits, knees (slightly darker rubber-like material at articulation points).
- **Face**: sculpted realistic human face (nose, lips, eyes with irises), calm neutral
  expression, bald head with seam lines tracing the skull like phrenology curves.
  Ears are simplified/absent, side of head has paneling.
- **Environment**: soft warm-gray concrete walls (large flat panels, subtle texture),
  bright diffuse daylight from behind/left, beige carpet floor. Architectural,
  minimal, gallery-like. Shallow depth of field in the closeup.
- **Lighting**: soft studio HDRI feel -- one large warm key from the back-left creating
  gentle rim on shoulders, ambient bounce fills, no hard shadows, no colored lights.
- **Mood**: serene, premium, humane. The robot looks contemplative, not menacing.

For OSCEN: the brain visualization must end up glowing inside this figure's head
(translucent/x-ray shell moment), so the head needs either a separate "cranium shell"
material state or a fresnel/x-ray shader variant.

**Model sourcing note**: the screenshots are frames from a CGI reel (social media),
not from a live website -- there is no model to download. We need a rigged GLB that
matches: stock marketplace android (Sketchfab/CGTrader, retextured to matte white +
seam normal map), AI image-to-3D as a base mesh (available via higgsfield generate_3d),
or custom sculpt. Decision pending (see open questions in PROGRESS.md).

---

## 2. Reference site A -- AI Robots / Unitree Go2

URL: https://ai-robots.apps.mdxpreview.xyz/unitree-go2
Images: `reference/ref-go2-hero.jpeg`, `ref-go2-pinned-stat.jpeg`,
`ref-go2-exploded-lens.jpeg`, `ref-go2-feature-section.jpeg`

### Stack (confirmed from page internals)

- **Astro v5.18** (meta generator tag), static output -- same framework as our current site.
- **GSAP 3.13/3.14 from CDN: ScrollTrigger + ScrollSmoother + SplitText.**
- **NO three.js.** The "3D" robot is a **pre-rendered image sequence**: ~800 AVIF
  frames (`RAW_GO2__NNNN.avif`) drawn to a `<canvas>` inside `.sequence-canvas`,
  scrubbed by scroll (Apple product-page technique, `sequence_frames.js`).
- Hero is an mp4 video (`videos/go2/hero.mp4`) with dark overlay; AVIF posters for
  later sections.
- Page is one long scroll (~24,000px for a ~900px viewport, i.e. ~27 screens).

### Scroll choreography (stage by stage)

1. **Hero**: full-bleed outdoor video of the robot, dark vignette overlay, centered
   title "Unitree Go2" + blue eyebrow "Transformative Newborn". Big statement line
   near the fold. Nav is a floating dark pill, centered.
2. **Pinned sequence 1**: black studio background, robot turntable/animation scrubbed
   frame-by-frame with scroll. Bottom-left oversized stat captions swap as scroll
   progresses ("20 Km/H / Max Speed", "IP67 Ingress Protection", "Continuous Stair
   Climbing (20-25cm)"). Caption = huge white sans + small blue label underneath.
3. **Macro moments**: the sequence includes camera fly-ins, e.g. an exploded-view of
   the LiDAR lens elements floating apart -- feature callouts timed to those frames.
4. **Copy sections**: centered H2 + measured paragraph (max ~60ch), robot hero image
   below, generous black space around everything.
5. **Product cards**: 3-up glass cards (z1 / Battery / SDK) with Add-To-Cart pill
   buttons (white bg, indigo icon chip).
6. **Closing CTA**: split layout -- left "Ready to Start Your Robotics Journey?" +
   paragraph + button, right robot render on deep-blue radial glow, rounded container.

### Design language

- Palette: near-black `#050505`-`#0a0a12` background, white text, single blue/indigo
  accent (approx `#4c6ef5`), glass surfaces `rgba(255,255,255,0.04)` with 1px borders.
- Type: geometric sans (Poppins-like) for everything; H1/H2 large (clamp ~3-5rem),
  captions in the pinned scenes are display-scale (~5rem) white with small blue
  sub-label; body text is small, gray, generously line-spaced, centered, narrow measure.
- Rhythm: every scene gets a full viewport or more; nothing is crowded. Text either
  sits bottom-left over the canvas or centered above the media.
- Rounded-2xl containers and pill buttons everywhere; nav is a floating pill bar.

### Techniques worth stealing

- Scroll-scrubbed pinned scenes with swapping oversized captions (we do this with
  the live three.js brain instead of an image sequence -- we get it for free, cheaper
  than 800 AVIFs).
- Caption pattern: HUGE stat + tiny colored label = high perceived design quality.
- One accent color only.
- ScrollSmoother (or Lenis) for the inertial feel -- the smoothness IS the premium feel.

---

## 3. Reference site B -- Unfor Dev portfolio

URL: https://unfor-dev.vercel.app/
Images: `reference/ref-unfor-hero.jpeg`, `ref-unfor-glass-cards.jpeg`,
`ref-unfor-gallery.jpeg`, `ref-unfor-footer.jpeg`

### Stack (confirmed by bundle analysis of `main.*.js`, 1.5MB)

- React (Create-React-App style build) + **three.js + React Three Fiber + drei**.
- **GSAP + ScrollTrigger + Lenis** smooth scroll.
- **Draco-compressed GLBs** (`model1.glb`, `model3.glb`, `Untitle.glb`) with
  **AnimationMixer** (skeletal/idle animations on the humanoid).
- Bloom postprocessing. Ambient audio with a SOUND toggle.
- Two canvases: main WebGL canvas + a fixed full-screen overlay canvas (z-9999) for
  transition/cursor effects.

### Experience choreography

1. **Preloader gate**: black screen, thin progress line + "100%" + bordered ENTER
   button ("Press Enter or click to continue"). Gate exists to preload GLBs and
   unlock audio autoplay. (We should NOT copy the gate on a marketing site -- it
   costs conversions -- but we DO copy the preload pattern silently.)
2. **Hero**: giant condensed display type "UNFOR DEV" fills ~80% of viewport width;
   the black glossy android (blue glowing visor + chest accents) rises INTO the
   text from below, overlapping the letters (model in front of some glyphs, behind
   others = depth illusion). Starfield background. Corner HUD: "Code by Unfor",
   SOUND toggle, LOCAL TIME, "CREATING MEMORABLE", "SCROLL TO EXPLORE" center-bottom.
3. **About section**: "WORKING WORLDWIDE" ghost-outline type, then frosted-glass
   text cards (rounded, blurred dark panels with corner ticks) slide in over the 3D
   scene; the android's head looms dimly behind/beside the cards. A MacBook 3D model
   appears for the skills section.
4. **Gallery fly-through**: the camera flies INTO a 3D room -- concrete ceiling,
   corrugated metal walls, dark floor with a runway stripe -- where project
   screenshots hang as framed canvases down both sides, pendant lights overhead.
   Scroll = dolly down the corridor past each project. A curved video wall sits at
   the far end.
5. **Footer**: pure typography on black -- "Let's Create" solid white + "Immersive
   Experiences" outline stroke text, then a 3-column contact grid (EMAIL / WORK
   MODEL / AVAILABILITY) and link row. Clean grid lines, huge whitespace.

### Design language

- Black `#000`-`#0a0a14`, white type, single blue accent (the android's glow).
- Display font: ultra-condensed extended sans for hero (like Monument Extended /
  Druk); UI text: spaced-out uppercase small caps; body: light grotesk.
- Frosted-glass panels with corner tick marks (photo-corner brackets) -- distinctive.
- HUD-style persistent chrome (time, sound, marquee) = "live system" feeling.

### Techniques worth stealing

- Model-overlapping-typography hero (brain floats in front of/behind OSCEN wordmark).
- Glass cards WITH corner ticks over a live 3D background for explainer copy.
- Camera fly-through as section transition (our version: fly INTO the humanoid's head).
- Persistent HUD chrome showing live brain stats (step count, firing rates) -- we have
  REAL live data, which this portfolio fakes. That's our unfair advantage.
- Silent preload + graceful reveal instead of ENTER gate.

---

## 4. What we already have (audit summaries)

### Current site (`oscen-website/`, Astro 5 + Tailwind v4 + GSAP)

- 13 landing sections in `src/components/sections/` (Hero, ProofStrip, Problem,
  Solution, InspiredByYou, Proof, HowItWorks, RealWorld, Market, Vision,
  FounderVision, ThreePaths, CTA) + pages: architecture, research, invest, build,
  contact, support, privacy, terms, investor-pitch/*.
- Hero already embeds the brain via `<iframe src="/brain-viz/index.html?embed=true">`
  (`src/components/sections/Hero.astro`) and already drives zoom from a GSAP
  ScrollTrigger via postMessage (`src/scripts/scroll-animations.ts`). The mouse
  parallax postMessage is a no-op (brain-viz never handles `mouse`).
- Design tokens all in `src/styles/global.css` (Tailwind v4 `@theme`): void/abyss/
  deep/surface/elevated backgrounds, blue `#5ea4f5` + cyan/green/amber/pink/purple
  accents, Instrument Serif display + Outfit body + JetBrains Mono.
- Working infra to PRESERVE: Formspree forms, Buttondown, Meta Pixel + Conversions
  API (`netlify/functions/meta-capi.ts`), GTM, Plausible, cookie consent state
  machine, sitemap, Netlify deploy. This plumbing is the most annoying thing to
  rebuild -- do not throw it away.
- `public/brain-viz/` is a STALE COPY of `oscen/brain-viz/` (they have drifted;
  source is newer). Two divergent copies must become one module during the rebuild.

### Brain viz (`oscen/brain-viz/`, vanilla three.js r169, no build step)

- Clean class contract: `BrainRegions` (15 InstancedMesh point-cloud regions,
  ~10-15k instanced spheres), `BrainPulses` (68 TubeGeometry pathways with GLSL
  Gaussian pulse shader), `BrainSynapses` (lightning alternative), hull mesh with
  procedural sulci shader, starfield, UnrealBloom, neuromodulator-driven lighting.
- `DataBridge` (`data-bridge.js`) is fully separable: WebSocket live mode
  (wss://demo.oscen.ai/ws) with auto-fallback to procedural simulated mode; carries
  the real topology constants (15 REGIONS, positions/shapes, 66 pathway groups).
  Runs standalone with zero backend.
- Coupling to cut when extracting (full list in the audit): self-boot singleton at
  module bottom, hardcoded `#canvas-container` + window sizing, global listeners
  without teardown, HTML label overlay on document.body, HUD element ids, URL-param
  config, importmap/vendored lib (replace with npm three), no offscreen pause.
- `demos/body-scene.js` already contains a container-scoped procedural humanoid with
  `buildHead()` (skull + visor + glowing eyes) -- the architectural template for a
  mountable scene class, and proof the brain-in-head merge works.
- Scale note: brain is ~radius 5.5 world units; a realistic head is ~0.1m -- plan a
  ~50x group rescale or rebuild both in one scene at consistent scale.
- Perf notes: instance matrices rewritten every frame (main CPU cost), ~90 draw
  calls with tubes, two rAF loops, no visibility pause. Budget work needed before
  it shares a frame with a skinned humanoid + environment.

---

## 5. Synthesis -- what the new site should feel like

One sentence: **the Go2 site's scroll discipline and caption system + the unfor-dev
site's live-3D-behind-typography and fly-through + our real live brain data +
the humanoid from the screenshots as the destination of the whole story.**

Narrative spine (matches the requested flow):

1. HERO -- the brain, full-screen, alive (live/sim data), floating in front of/behind
   the OSCEN wordmark. Generous space, one accent color, live stat HUD.
2. HOW IT WORKS -- pinned scroll scenes: camera glides around the brain, regions
   light up one at a time, oversized captions swap (Sense / Encode / Think / Act /
   Learn). Real firing-rate data drives what you see.
3. THE REVEAL -- the brain shrinks and glides into the head of the humanoid as she
   fades/assembles in (x-ray head shell moment), camera pulls back: the brain you
   just learned about is the mind of this body.
4. THE BODY -- full-body humanoid in the soft concrete environment (screenshot look),
   idle/breathing animation, copy about any-body/one-brain, specialist brains,
   power efficiency.
5. PROOF + PATHS -- stats, comparison, Invest / Build / Follow, typographic footer.

Design rules distilled from both references:

- Near-black canvas, ONE accent (keep OSCEN blue `#5ea4f5`), white type.
- Display type at 5-10rem; captions = giant stat + tiny colored label.
- Frosted-glass panels with corner ticks for body copy over 3D.
- Every scene gets >= 1 viewport of room. Whitespace is the luxury signal.
- Smooth scroll (Lenis/ScrollSmoother) + pinned ScrollTrigger scenes.
- Persistent minimal HUD with REAL live numbers (step count, neurons, synapses).
- No entry gate; silent preload with progressive reveal.
