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

- [x] Branch `redesign-v2` off `main`. (Netlify branch-deploy previews: enable in
      Netlify UI when first pushing the branch.)
- [x] `npm i three lenis` + `-D @types/three` (gsap already present).
      **three is PINNED to 0.160.0** -- canonical brain-viz vendors r160, and
      r185 renders the same scene blown out (bloom/color pipeline changes:
      differentiated clusters become one white core). Verified side-by-side
      2026-07-24. Upgrading three later requires re-tuning bloom
      threshold/strength and re-checking additive materials.
- [x] Reference assets committed: `docs/reference/*` (10 images) +
      `docs/REDESIGN-REFERENCE.md` + this file.
- [~] Open questions: proceeding on recommended defaults (Astro + vanilla three
      in-repo; landing-page scope; re-skin copy; no audio; fonts TBD in Phase 6;
      humanoid sourcing still needs founder decision before Phase 4).

## Phase 1 -- Extract the brain into a mountable module (1-2 days)

Source: `oscen/brain-viz/` (canonical, newer than the website copy).

- [x] `src/three/brain/` created. `data-bridge.js`, `brain-regions.js`,
      `brain-pulses.js` ported from canonical `oscen/brain-viz/` (2026-07-24
      state) nearly verbatim. DataBridge additions: `onStatus()` callback,
      `dispose()`, postMessage listener now opt-in (`listenPostMessage`).
- [x] `brain-module.js` -- `BrainModule`: regions + pulses in one THREE.Group,
      bridge wiring, `update/setDim/setScale/getRegionCenter/dispose`. No DOM.
- [x] `brain-stage.js` -- `BrainStage(container, opts)` replaces `BrainScene`:
      container-scoped sizing (ResizeObserver), options object instead of URL
      params, full teardown, ACES + UnrealBloom + fog + starfield + neuromod
      light/bloom effects ported. Idle auto-orbit + `setPointer()` parallax when
      non-interactive; OrbitControls when `interactive: true`. Scroll hooks for
      Phase 2: `setCameraPose/releaseCameraPose/focusRegion/setBloomStrength`.
- [x] Offscreen pause (IntersectionObserver + visibilitychange), DPR cap (2),
      `prefers-reduced-motion` = static camera.
- [x] `/dev/brain` test page (noindex, not linked): OrbitControls, sim data,
      fps/status HUD, focus + dim buttons. **Visual parity confirmed vs canonical
      brain-viz served statically** (after pinning three to r160 -- see Phase 0).
      121 fps desktop. NOTE: the old `public/brain-viz` copy on the site is
      visually STALE (narrower hull, dimmer shell, no pulse flash); the canonical
      look is the target, so the new hero will look slightly different (better)
      than the current one.
- [x] Live mode stays available: `new BrainStage(el, { mode: 'live', wsUrl })`.
      Default is simulated.

## Phase 2 -- Scroll rig + new hero (2-3 days)

- [x] `src/scripts/experience.ts`: BrainStage mounted in fixed transparent
      canvas (`#experience` z-1; `main > section` z-10 via global.css), Lenis
      bridged to ScrollTrigger via gsap.ticker, hero choreography (orbit dolly
      14->23, dim 0->0.75, bloom 1.0->0.45, back-title fade). Exposed as
      `window.__experience`. Reduced motion skips Lenis + choreography.
- [x] Hero rewritten (`Hero.astro`): iframe GONE, copy unchanged, parallax now
      drives `stage.setPointer` directly (old postMessage was a no-op),
      BrainVizPlay conversion preserved. Giant OSCEN back-title: the bloom
      composer writes OPAQUE alpha so under-canvas text can never show through;
      implemented instead as an over-canvas layer with `mix-blend-mode: screen`
      (bright particles overpower glyphs = same depth read). Stat line honest:
      "Training now" replaces the cosmetic "Live" badge.
- [x] HUD chrome (`ExperienceHUD.astro`): bottom-left live ticker (step count,
      neurons, SIMULATED/LIVE mode from real bridge status events), bottom-right
      sound toggle. font-tech (Space Grotesk added to Base.astro fonts).
- [x] Audio (Q6): `audio-controller.ts` -- HEAD-probes `/audio/ambient.mp3`,
      toggle stays hidden until the file EXISTS (drop it in public/audio/ to
      activate), autoplay attempted + one-shot gesture unlock fallback, 2.5s
      fades, localStorage preference. Expect one dev-console 404 until the
      track ships -- harmless, by design.
- [x] Silent preload: brain is procedural (renders in <1s), canvas fades in
      over 2s. No gate, no progress bar needed at current asset weight.
- [ ] Mobile: verify on real device; add reduced particle counts / static
      poster fallback if needed. (Desktop verified at 120fps; DPR already
      capped at 2; offscreen pause active.)
- [ ] Polish pass with fresh eyes: eyebrow legibility over bright clusters,
      back-title size/opacity tuning, hero->ProofStrip transition timing.

## Phase 3 -- "How it works" pinned scenes (2-3 days)

Reference: ref-go2-pinned-stat.jpeg caption system.

- [x] Pinned 500vh scene in HowItWorks.astro: per-step focusRegion glide +
      orbit pose + MOODS.focus brighten (named mood states in experience.ts).
      Step->region mapping in `src/data/how-it-works.ts` (Sense=sensory_cortex,
      Encode=feature_layer, Think=association_cortex, Act=motor_cortex,
      Learn=predictive_layer). Degrades to a plain list without JS/reduced
      motion (.hiw-pinned toggles the overlay layout).
- [x] Oversized caption swap bottom-left (font-tech verb + accent step counter
      + desc, gsap cross-fade, header yields after step 1, .text-scrim shared
      utility for legibility over bright clusters).
- [x] Real firing bursts per step via new `DataBridge.applyOverride()` (public
      method refactored out of the demo_reaction postMessage handler; flare
      0.18 merged via max() over organic sim activity).
- [ ] Glass explainer cards (corner-tick style) for Problem/Solution copy
      blocks -- rolled into Phase 6 restyle pass.

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

- **Q1 -- Stack sign-off**: ANSWERED 2026-07-24 -- YES, Astro + vanilla three.js
  in-repo on `redesign-v2`.
- **Q2 -- Humanoid sourcing**: ANSWERED 2026-07-24 -- custom sculpt built from an
  AI image-to-3D base (generate from the target screenshots, then clean up
  topology/materials, add panel-seam detail, rig for idle animation). The
  feminine EVE-style android IS confirmed as the brand's face. Fallback if the
  AI base can't reach hero-closeup quality on the FACE: keep the AI body, swap
  in a sculpted/stock head, or drop to a stock rigged android retextured.
- **Q3 -- Typography**: ANSWERED 2026-07-24 -- HYBRID: technical sans for HUD
  chrome, captions, and stat numbers; Instrument Serif stays for narrative
  headlines. MUST be applied consistently across the ENTIRE site (inner pages
  included), not just the landing experience.
- **Q4 -- Copy scope**: ANSWERED 2026-07-24 -- consolidate per recommendation
  (merge Vision + FounderVision, trim Market) BUT the competitor comparison
  content (Market's competitor table + VLA-ceiling explainer) MUST be kept.
- **Q5 -- Page scope**: ANSWERED 2026-07-24 -- landing page only for now; inner
  pages get restyled tokens/nav/footer. REMINDER OWED TO JESUS: after landing
  launch, revisit inner pages (architecture/research/invest) for deeper
  treatment.
- **Q6 -- Sound**: ANSWERED 2026-07-24 -- build the audio functionality now
  (player + HUD toggle + autoplay-with-gesture-unlock, off until a track file is
  dropped in); Jesus will supply the actual track later. REMINDER OWED TO JESUS:
  ask for the audio track when Phase 6 polish starts.

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
