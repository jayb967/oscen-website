# OSCEN Website Redesign -- PROGRESS

Full-experience rebuild of oscen.ai: live three.js brain hero -> scroll-driven
explainer -> brain shrinks into a 3D humanoid's head -> humanoid reveal.

**Read `docs/REDESIGN-REFERENCE.md` first** -- it holds the investigation of both
reference sites, the humanoid target screenshots (`docs/reference/humanoid-target-*.png`),
audits of the current site + brain-viz module, and the distilled design rules.
Reference it during every phase.

Status legend: [ ] todo · [~] in progress · [x] done

---

## Architecture decision (recommended, pending founder sign-off)

**Rebuild IN THIS REPO on a branch (`redesign-v2`), keep Astro, go vanilla three.js.**

Why not a new folder/repo:
- The Go2 reference site is literally Astro 5 + GSAP -- our exact current stack.
- The audit showed the expensive-to-rebuild parts (Meta CAPI Netlify function,
  consent state machine, GTM/Plausible, Formspree/Buttondown wiring, SEO/sitemap,
  Netlify deploy) are framework-glue we keep for free by staying.
- The brain-viz classes are vanilla three.js; React Three Fiber would add a React
  runtime just to host code that isn't React. unfor-dev uses R3F because its author
  is a React dev, not because the effect needs it.
- The visual rebuild is real (new sections, new canvas layer, some new tokens) but
  it replaces section internals, not the chassis. A git branch gives isolation;
  a second folder gives drift.

What changes structurally:
- three.js becomes an npm dependency (`three`, ~r169+) bundled by Astro/Vite --
  the iframe + postMessage bridge and vendored `public/brain-viz/lib/` go away.
- One persistent full-viewport `<canvas>` (fixed, z-0) hosts a single scene
  (brain + humanoid + environment); DOM sections scroll over it; GSAP ScrollTrigger
  timelines drive camera/scale/materials directly. Add Lenis (or ScrollSmoother)
  for inertial scroll.
- `oscen/brain-viz/` stays canonical for the product/dashboard; the website gets an
  extracted npm-style module (see Phase 1) so the two stop drifting.

---

## Phase 0 -- Foundation (0.5-1 day)

- [ ] Branch `redesign-v2` off `main`; Netlify branch-deploy previews on.
- [ ] `npm i three gsap lenis` (gsap already present); `npm i -D @types/three`.
- [ ] Confirm reference assets committed: `docs/reference/*` (10 images) +
      `docs/REDESIGN-REFERENCE.md` + this file.
- [ ] Decide open questions below (fonts, model sourcing, page scope, copy scope).

## Phase 1 -- Extract the brain into a mountable module (1-2 days)

Source: `oscen/brain-viz/` (canonical, newer than the website copy).

- [ ] Create `src/three/brain/` in this repo: port `data-bridge.js` (DataBridge +
      REGIONS/POSITIONS/SHAPES/PATHWAYS) unchanged; port `BrainRegions`,
      `BrainPulses` (+ hull/sulci shader, starfield) as ES modules importing npm
      `three`.
- [ ] Write `BrainModule` class replacing `BrainScene`: constructor takes
      `{ scene, camera | null, quality, mode }`, no DOM/window access, exposes
      `update(dt)`, `setFiringRates()`, `setNeuromodulation()`, `setDim()`,
      `setScale()`, `dispose()`. Model it on `oscen/brain-viz/demos/body-scene.js`
      (already container-scoped).
- [ ] Cut the 9 coupling points listed in REDESIGN-REFERENCE.md section 4 (no
      self-boot, no #canvas-container, no document.body labels, options object
      instead of URL params, teardown for all listeners).
- [ ] Add offscreen/visibility pause + DPR cap + `prefers-reduced-motion` static mode.
- [ ] Standalone test page `/dev/brain` rendering the module inline (no iframe) with
      sim data. Verify visual parity with the current hero (bloom, colors, pulses).
- [ ] Keep WebSocket live mode behind a flag (`?ws=` for demos; marketing default =
      simulated, same as today -- honest labeling, no fake "Live" badge).

## Phase 2 -- Scroll rig + new hero (2-3 days)

- [ ] `SiteExperience` orchestrator: one WebGLRenderer + fixed canvas behind all
      content, single rAF, GSAP ScrollTrigger master timeline mapped to camera
      position/target + per-section scene state. Lenis wired to ScrollTrigger.
- [ ] Hero (reference: ref-unfor-hero.jpeg + current hero copy): brain floats
      center, oversized OSCEN display type split so the brain overlaps letters
      (front/behind depth trick -- two text layers, one behind canvas via z-index,
      one masked in front). Keep current copy ("Intelligence that grows" etc).
- [ ] Persistent HUD chrome: top-left wordmark, top-right nav, bottom-left live
      stat ticker (step count / neurons / synapses from DataBridge), bottom-center
      SCROLL TO EXPLORE. Small, monospace, spaced uppercase.
- [ ] Silent preload: assets load during hero (brain is procedural = instant;
      humanoid GLB streams in background), thin progress line only if >400ms.
- [ ] Mobile: reduced particle counts + capped DPR; verify 60fps on a mid phone,
      else static poster fallback.

## Phase 3 -- "How it works" pinned scenes (2-3 days)

Reference: ref-go2-pinned-stat.jpeg caption system.

- [ ] Pinned section (300-500vh): camera orbits/glides around the brain; each stop
      highlights one stage -- Sense / Encode / Think / Act / Learn (reuse
      HowItWorks.astro copy) -- by focusing a region cluster (`focusRegion` lerp
      logic from BrainScene) and dimming the rest (`setDim`).
- [ ] Oversized caption swap bottom-left: giant white stat/verb + small blue label,
      SplitText-style stagger on enter/exit.
- [ ] Trigger real synapse pulse bursts on section transitions (DataBridge
      demo_reaction pathway already supports firing-rate overrides).
- [ ] Glass explainer cards (corner-tick style, ref-unfor-glass-cards.jpeg) for the
      Problem/Solution copy blocks between pinned scenes.

## Phase 4 -- The humanoid (3-5 days, parallelizable with Phase 3)

Target: `docs/reference/humanoid-target-fullbody.png` + `humanoid-target-closeup.png`.

- [ ] Source the model (open question Q2): rigged feminine android GLB; retexture to
      matte porcelain white + panel-seam detail (seams via normal/AO map or curve
      decals; darker rubber at joints). Draco/meshopt-compress; budget <= 8MB,
      <= 100k tris, 2k textures.
- [ ] Environment to match screenshots: warm-gray concrete panel walls (large flat
      boxes + subtle roughness texture), beige floor, soft HDRI key from back-left,
      contact shadows, gentle fog. Keep it minimal -- 3 planes + lightmap-feel, not
      a full room.
- [ ] Head variant: cranium shell with fresnel/x-ray translucency state so the brain
      can glow inside; eyes stay lit.
- [ ] Idle animation: subtle breathing/weight-shift loop (AnimationMixer). If the
      purchased rig lacks animation, add a 5s procedural sway + head tracking
      toward cursor/scroll.
- [ ] Standalone test page `/dev/humanoid` for material/lighting iteration against
      the screenshots side-by-side.

## Phase 5 -- The reveal: brain -> head (2-3 days, the signature moment)

- [ ] Pinned transition section: brain scales down (~50x, animate group scale +
      camera dolly simultaneously so it reads as "camera pulls back"), glides to
      the humanoid's head position as she fades/assembles in; head shell goes
      x-ray; bloom tightens; captions explain "one brain, any body".
- [ ] Camera then orbits the head closeup (match humanoid-target-closeup.png
      framing), brain pulsing inside the skull.
- [ ] Pull-back to full body in the concrete environment (match fullbody framing);
      environment lights up from black as the camera retreats.
- [ ] Scroll-scrub the whole thing (no autoplay) with soft snap points; reversible.
- [ ] Perf gate: brain (reduced LOD when small) + skinned humanoid + env must hold
      60fps desktop / 30fps mobile; else LOD swap (instanced spheres -> points)
      when brain is head-sized.

## Phase 6 -- Content sections + full redesign pass (3-4 days)

- [ ] Re-skin remaining landing sections over/between the canvas scenes, in order:
      Proof (stats grid), Market (comparison), RealWorld, Vision/FounderVision
      (condense -- see Q4), ThreePaths, CTA + typographic footer (ref-unfor-footer
      style: giant solid + outline type, contact grid).
- [ ] Typography decision (Q3) applied site-wide; spacing normalized to the
      "every scene breathes" rule; one accent color enforced.
- [ ] Rehouse section copy into `src/data/` while porting (audit finding: copy is
      currently inline in 13 .astro files).
- [ ] Inner pages (architecture, research, invest, build, contact, support, legal,
      investor-pitch): restyle with new tokens/nav/footer only -- no 3D -- unless Q5
      says otherwise. investor-pitch/demo keeps its iframe until Phase 7.
- [ ] Accessibility: reduced-motion = static renders + full copy; keyboard nav;
      contrast check on glass panels.

## Phase 7 -- Hardening + launch (2 days)

- [ ] Analytics/consent regression: Meta pixel + CAPI events, GTM, Plausible,
      cookie consent, Formspree, Buttondown all fire as before (BrainVizPlay event
      moves from iframe interaction to canvas interaction).
- [ ] Replace `public/brain-viz` usage: hero no longer iframes it; keep the folder
      only for investor-pitch/demo or point that at the new module; delete the
      stale copy once nothing references it. Sync any brain-viz fixes back to
      `oscen/brain-viz/` (canonical).
- [ ] Cross-browser (Safari WebGL quirks, iOS memory), Lighthouse (LCP: render
      first brain frame < 2.5s; ship no GLB in critical path), OG images updated
      to new visuals.
- [ ] Netlify preview review -> merge to `main`.

Total estimate: ~3 weeks focused work.

---

## Open questions for Jesus (answer before Phase 1 ends)

- **Q1 -- Stack sign-off**: OK with staying Astro + vanilla three.js in this repo on
  a branch (recommendation above), vs. a fresh React/R3F project in a new folder?
- **Q2 -- Humanoid sourcing**: (a) buy + retexture a stock rigged android (fastest,
  $50-300, closest controllable match), (b) AI image-to-3D from the screenshots as
  a base then cleanup (cheap, quality risk for hero closeups), (c) commission a
  custom sculpt (best match, slowest/priciest). Also: confirm the feminine
  EVE-style android IS the OSCEN brand direction (it will become the face of the
  company site).
- **Q3 -- Typography**: keep Instrument Serif + Outfit (current brand, humane/warm),
  or move toward the references' technical display sans (condensed/extended
  grotesk) for hero type? (Hybrid possible: display sans for HUD/captions, serif
  for narrative headings.)
- **Q4 -- Copy scope**: pure re-skin of existing 13-section copy, or also consolidate
  (e.g. merge Vision + FounderVision, trim Market) while we're in there?
- **Q5 -- Page scope**: landing page only gets the 3D experience (inner pages just
  restyled), or should architecture/research get their own scroll scenes too?
- **Q6 -- Sound**: unfor-dev has ambient audio + toggle. Add a subtle neural
  soundscape (off by default), or skip audio entirely?

## Reference file map

- `docs/REDESIGN-REFERENCE.md` -- full investigation + design rules (read first)
- `docs/reference/humanoid-target-fullbody.png` / `humanoid-target-closeup.png` --
  THE look to emulate for the humanoid + environment + lighting
- `docs/reference/ref-go2-*.jpeg` -- caption system, pinned scenes, spacing, cards
- `docs/reference/ref-unfor-*.jpeg` -- hero type/model overlap, glass cards,
  fly-through, footer
- `oscen/brain-viz/` -- canonical brain source (audit in REDESIGN-REFERENCE.md §4)
- `src/styles/global.css` -- current design tokens (carry forward)
- `src/scripts/scroll-animations.ts` -- current GSAP patterns (hero zoom bridge to
  be replaced in Phase 2)
