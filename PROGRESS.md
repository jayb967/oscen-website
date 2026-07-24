# OSCEN Website Redesign -- PROGRESS

Full-experience rebuild of oscen.ai: live three.js brain hero -> scroll-driven
explainer -> brain shrinks into a 3D humanoid's head -> humanoid reveal.

**Read `docs/REDESIGN-REFERENCE.md` first** -- it holds the investigation of both
reference sites, the humanoid target screenshots (`docs/reference/humanoid-target-*.png`),
audits of the current site + brain-viz module, and the distilled design rules.
Reference it during every phase.

Status legend: [ ] todo · [~] in progress · [x] done

---

## 2026-07-24 CINEMATIC BRAIN SWAP -- FULL PLAN (NEXT SESSION: START HERE)

The canonical brain-viz in the sibling repo (`oscen/brain-viz/`) was
overhauled to a single Cinematic version (classic point-cloud renderer
retired). The website ships the OLD classic look in two places; both must
switch. Investigation is DONE (2026-07-24 late session); the findings and
decisions below are settled -- do not re-litigate, just execute.

**DECIDED: no iframe for the hero.** The Phase 5 reveal mounts the
humanoid INTO BrainStage's scene and shrinks the brain into her skull --
one shared scene/camera/bloom chain. An iframe brain is a separate WebGL
context, so the reveal (plus setLateralOffset / mood tweens / HIW
region-flare choreography, all direct API calls) would die. Hero = native
port (Phase 2 below). Investor demo = wholesale folder copy (Phase 1).
Jesus signed off 2026-07-24; scroll perf must not degrade noticeably.

### Canonical source facts (verified)

- `oscen/brain-viz/` is self-contained: `lib/` (vendored three + addons via
  import map), `assets/brain.glb` (4.3 MB anatomical mesh), `demos/`
  (416 KB), total 5.8 MB. Entry `index.html` ALWAYS boots
  `brain-scene-cinematic.js` (`?ver=` ignored). Embed contract:
  `index.html?embed=true` hides HUD, `&mode=sim` forces simulated data.
- `BrainSceneCinematic extends BrainScene` and adds everything via
  `_initEnhancements`/`_updateEnhancements` hooks. The cinematic layer is
  5 self-contained modules: `brain-shell.js` (glass GLB shell +
  `buildAnatomyCenters`), `brain-pointcloud.js` (200-330k GPU points
  sampled in the mesh; `build(mesh)` / `setFiringData(regionData)` /
  `setNeuromodulation(nm)` / `update(dt)`), `brain-postfx.js`
  (`createGradePass`: vignette/grain/CA), `quality-tier.js`
  (`detectQualityTier(renderer)` -> pixelRatio/point counts/bloom/grade),
  `region-anatomy.js` (`REGION_ANATOMY` anchors).
- Cinematic bloom regime: threshold 0.80, radius 1.05, strength CAP 0.34,
  toneMappingExposure 1.0, resting cloud dim (uBright 0.14) so only firing
  regions + pulses bloom. Neuromod arousal boost is capped after the base
  update (see `_updateNeuromodEffects` override).
- IBL: PMREM RoomEnvironment on `scene.environment` only (background stays
  dark). Site three is npm-pinned 0.160.0 -- every API the cinematic code
  uses (PMREM, RoomEnvironment, transmission) exists there.
- TIMING TRAP: the site's `src/three/brain/` port was taken from the
  canonical 2026-07-24 ~14:11 state, but canonical `brain-regions.js` /
  `brain-pulses.js` gained the cinematic hooks at ~21:05 the same day:
  regions: `setBilateralCenter`, `getCenter(id, side)`, `setLabelCamera`,
  `setHullVisible`, `setCloudVisible`, `regionData` exposure; pulses:
  `rebuild()`, `radialArcScale` (curved fiber-tract arcs, cinematic sets
  0.45 + `lateralSpread` 0), bilateral per-hemisphere tube build. These are
  ADDITIVE diffs -- re-sync them into the site copies, preserving the
  site-specific DataBridge extras (onStatus, dispose, opt-in postMessage,
  applyOverride) already noted in Phase 1 of the redesign log.

### Phase 1 -- Investor demo swap (minutes, do first for a quick win)

1. Delete `public/brain-viz/` (848 KB stale classic), copy
   `oscen/brain-viz/` there wholesale (lib/, assets/, demos/, shaders/,
   all .js + index.html). 5.8 MB static, served as-is by Astro.
2. `src/pages/investor-pitch/demo.astro` line ~37: iframe src
   `/brain-viz/` -> `/brain-viz/index.html?embed=true&mode=sim`.
   (Jesus was asked about HUD-on vs off in the pitch iframe; default is
   embed=true = hidden. Drop the param if he wants the HUD.)
3. Verify in Playwright: cinematic boots in the iframe (glass shell,
   volumetric cloud, bilateral pulses), no console errors. Check whether
   demo.astro sends postMessage demo hooks and that they still fire.
4. Commit. This also gives an on-site pixel reference for Phase 2 parity.

### Phase 2 -- Hero native port (the real session)

Copy verbatim into `src/three/brain/`: brain-shell.js, brain-pointcloud.js,
brain-postfx.js, quality-tier.js, region-anatomy.js. Strip `?v=` import
suffixes; imports use the site's npm three (`three`,
`three/addons/environments/RoomEnvironment.js`).

Asset: `assets/brain.glb` -> `public/models/brain.glb`. COMPRESS FIRST
(gltf-transform draco, like the humanoid 8.5->5.4 MB; decoder already
self-hosted at public/draco/ -- BrainShell's loader must get the
DRACOLoader wired if the compressed file needs it).

Re-sync `brain-regions.js` + `brain-pulses.js` (diff canonical vs site,
port the additive cinematic hooks listed above).

Integration -- `brain-module.js` (CRITICAL: shell + point cloud go INSIDE
`module.group`, NOT the scene, so the reveal's `setScale` shrink and
`setDim` keep working):
- After shell GLB load: `buildAnatomyCenters(REGION_ANATOMY, REGIONS)`,
  `setBilateralCenter` per region, `pulses.rebuild()`, hide classic hull
  + instanced cloud, build BrainPointCloud with tier counts + centers.
- Per frame: `pointCloud.setFiringData(regions.regionData)`,
  `.setNeuromodulation(smoothNm)`, `.update(dt)`, `shell.update(dt)`.
- Extend `setDim` to also dim the shell material + point-cloud brightness
  uniform (check uniform names in brain-pointcloud.js).
- `getRegionCenter` (used by HIW focusRegion) automatically returns
  anatomical anchors once registered -- BUT the anatomy fix reverses the
  old front/back error, so RE-CHECK all five HIW step orbit poses
  visually; they may now frame the wrong side.

Integration -- `brain-stage.js`:
- Quality tier: `min(tier.pixelRatio, existing maxPixelRatio cap)` (site
  already caps 2 desktop / 1.5 mobile).
- Bloom: threshold 0.80, radius 1.05, cap 0.34 enforced after the
  neuromod boost (port the cinematic `_updateNeuromodEffects` cap).
  Exposure 1.2 -> 1.0 (then re-check humanoid reveal + outro looks).
- `scene.environment` = PMREM RoomEnvironment (shell needs it; humanoid
  x-ray ShaderMaterial ignores env so it is safe).
- RE-TUNE the mood/bloom vocabulary in experience.ts: MOODS
  hero/backdrop/focus bloom values (1.0/0.45/0.9) and the reveal +
  outro bloom ramps (0.6/0.42/0.18/0.24) were tuned for the OLD regime;
  under cap-0.34 they all clamp flat. Scale them into the new range
  (~0.34/0.16/0.30 starting points) and tune by eye per scene.

Scroll-perf guardrails (Jesus's hard requirement):
- Progressive boot: classic look renders first (cinematic already does
  this pre-GLB); kick the shell GLB fetch AFTER first hero paint
  (idle callback), keeping the no-GLB-in-critical-path LCP rule.
- Perf gates: hero >= 60 fps desktop; reveal heaviest frame (was 84 fps
  with 15k spheres) must stay >= 50 fps with shell + cloud + humanoid.
  If it dips: lower `fillTotal` for the site, or tier down one notch
  during the reveal (pointCloud opts are per-build).
- Mobile emulated 390x844: DPR 1.5 cap + low tier; static poster fallback
  remains the escape hatch per the v2 handoff.

### Verification (both phases)

- Reference: serve canonical statically (`cd oscen/brain-viz && python3
  -m http.server 8788`) and compare `http://localhost:8788/index.html?embed=true&mode=sim`
  side-by-side with the site hero + demo iframe (same viewport
  screenshots via Playwright).
- Full scroll-through: hero glide-back, brain-aside copy sections,
  Five-steps flares (anatomical anchors!), reveal shrink (glass shell +
  cloud inside the skull -- NEW look, check it reads well), outro spin.
- `/dev/brain` harness still boots; `npm run build` green, then RESTART
  the dev server (Vite stale-dep 504 gotcha, fires on new lazy imports
  too).
- Sync any brain-viz fixes discovered here BACK to `oscen/brain-viz/`
  (canonical), per the document-ownership rule.

---

## 2026-07-24 FEEDBACK ROUND 1 -- APPLIED (read this, then the v2 handoff below)

Jesus's first screenshot round is implemented, 5 commits on `redesign-v2`
(still NOT pushed). What changed:

1. **Brain glides aside for copy sections** -- `BrainStage.setLateralOffset`
   (screen-space camera strafe) scrubbed in experience.ts: out as Problem
   enters, held through Proof, back to center as How It Works arrives.
   Tunable: `COPY_ASIDE_PAN = 13` world units.
2. **No more pose snaps** -- mood + orbit live in a shared `stageState`
   (exposed as `__experience.state`); scrubbed scenes write it, hand-offs
   tween it. Fixes the "brain POPs at Five steps" bug (was an instant
   radius 23 -> 13 setOrbit). The pinned scene self-heals if a deep link
   lands mid-flush.
3. **Concrete room REMOVED from the reveal** (was reading as a floating
   gray slab). Figure stands on black. Room survives only in /dev/humanoid.
4. **Reveal body wears the GLB's real textures** -- the hybrid x-ray shader
   is now one instance per mesh sampling that mesh's albedo map, all
   sharing one uniform set. Flat porcelain is gone from the reveal.
5. **Post-reveal outro** -- `HumanoidReveal.setOutro(p)` scrubbed from pin
   release to the FOOTER's arrival (not page bottom -- the opaque footer
   would hide it): one slow full yaw revolution, ending front-facing in a
   head-and-shoulders portrait. Outro p=0 == reveal p=1, seamless.

GOTCHA addendum: the Vite "Outdated Optimize Dep" 504 can fire WITHOUT a
build -- lazily-imported deps (RoomEnvironment via /dev/humanoid) get
re-optimized on first hit. Same fix: restart the dev server.

---

## 2026-07-24 SESSION HANDOFF v2 (late evening) -- workflow reference (superseded as entry point by the CINEMATIC BRAIN SWAP plan above)

**State**: branch `redesign-v2` (NOT pushed, deliberately: Jesus wants a
local feedback round first), 11 commits ahead of `main`, all builds green,
working tree clean. Phases 0-6 functionally COMPLETE including the Phase 5
reveal; Phase 7 (hardening/launch) not started. Q1-Q6 answered (bottom).

**NEXT SESSION = VISUAL FEEDBACK ROUND**: Jesus will supply screenshots
with change requests against the running site. Before touching code, make
sure the dev server is up (`cd oscen-website && npm run dev` -> :4321,
restart it after any `npm run build` -- the build invalidates the Vite
dep cache and the dev server starts 504ing "Outdated Optimize Dep").
Iterate screenshot-by-screenshot; verify each fix visually (Playwright)
before moving on; commit in small logical chunks. Push only when he says.

**Page map for feedback triage:**
- Landing experience: Hero -> ProofStrip -> Problem -> Solution ->
  InspiredByYou -> Proof -> HowItWorks (pinned) -> Reveal (pinned,
  brain-into-head) -> RealWorld -> Market -> Vision -> ThreePaths -> CTA
  -> Footer. Landing copy lives in `src/data/sections.ts` (+ reveal.ts,
  how-it-works.ts); section markup in `src/components/sections/`.
- 3D: `src/three/brain/` (BrainModule/BrainStage) + `src/three/humanoid/`
  (humanoid-figure.js = model/materials/x-ray/head-tracking,
  humanoid-environment.js = concrete room, humanoid-reveal.js = Phase 5
  choreography). Scroll wiring: `src/scripts/experience.ts`.
- Debug harnesses: /dev/brain, /dev/humanoid (framing + material buttons,
  sliders, drag-drop GLB). Choreography debug from the landing page
  console: `__experience.reveal.enter(); __experience.reveal.setProgress(0.5)`.
- Inner pages (architecture/research/invest/build/contact/support/
  privacy/terms): restyled tokens + shared `Footer.astro`.

**Design contracts currently in force (change only if Jesus asks):**
- One accent (blue); semantic exceptions: red = problem/flaw/severity,
  green = live/advantage/excitatory, pink = inhibitory (arch 80/20),
  amber = warnings. Type: Instrument Serif narrative headlines, Space
  Grotesk (`font-tech`) for HUD/captions/stats. JetBrains Mono unloaded.
- Glass cards carry `.glass-ticks` corner brackets (background strokes;
  ::after is reserved for the glow hint).
- Footer giant type: "One brain." solid / "Any body." outline, mirrors
  the reveal captions.

**Critical gotchas (learned the hard way, do not rediscover):**
1. `three` is PINNED to 0.160.0. r185 blows out the bloom into a white core.
   Any upgrade requires re-tuning UnrealBloom + re-verifying visually.
2. The bloom EffectComposer writes OPAQUE alpha -- content stacked UNDER the
   canvas can never show through. The giant OSCEN hero type therefore sits
   ABOVE the canvas with `mix-blend-mode: screen`. Don't retry under-canvas.
3. Layer contract: `#experience` fixed z-1 (canvas + ghost title),
   `main > section` relative z-10 (global.css). New sections need no extra
   work; new fixed chrome goes z-20+.
4. Copy sections between hero and HowItWorks intentionally show the DIMMED
   brain behind them (MOODS.backdrop). Pinned scenes brighten to MOODS.focus.
5. The site's `public/brain-viz/` is a STALE copy kept only for
   investor-pitch/demo. Canonical source = `oscen/brain-viz/`. Phase 7
   deletes the stale copy.
6. Playwright MCP browser sometimes wedges with "Browser is already in use":
   kill via `ps ax -o pid,command | grep mcp-chrome | awk '{print $1}' | xargs kill`.

**Next steps in order (updated 2026-07-24 late evening):**
1. VISUAL FEEDBACK ROUND (next session): apply Jesus's screenshot-driven
   fixes. See "NEXT SESSION" block above for the workflow.
2. After sign-off: push `redesign-v2`, enable the Netlify branch preview,
   and have Jesus do the REAL-DEVICE mobile check on the preview URL
   (emulated pass done; DPR cap 1.5 on small screens shipped; add a
   static poster fallback only if a real phone struggles).
3. Phase 7 hardening/launch checklist as written (analytics/consent
   regression, delete stale public/brain-viz once nothing references it,
   cross-browser + Lighthouse, OG images, then merge to main).
4. Known small leftovers, do opportunistically: reveal soft snap points;
   shoulder-joint texture cleanup on the GLB (needs a DCC tool, not code);
   deep-link-past-reveal shows the plain brain backdrop (accepted).

**Reminders owed to Jesus** (surface these when relevant):
- ASK FOR THE AMBIENT AUDIO TRACK: player fully wired, activates the
  moment `public/audio/ambient.mp3` exists (reminder already given once).
- After landing launch: revisit inner pages (architecture/research/
  invest) for deeper treatment (currently tokens/footer only, per Q5).
- Higgsfield balance after the humanoid generation: 1,165 credits.

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
- [~] Mobile: EMULATED check 2026-07-24 (390x844): 93fps hero, 78fps mid-page,
      layout intact. DPR cap lowered to 1.5 on <=768px screens (experience.ts).
      STILL OWED: real-device verification (emulation ran on desktop GPU);
      add static poster fallback only if a real phone struggles.
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
- [x] Glass explainer cards (corner-tick style) for Problem/Solution copy
      blocks -- done in the Phase 6 restyle pass (.glass-ticks, 2026-07-24).

## Phase 4 -- The humanoid (3-5 days, parallelizable with Phase 3)

Target: `docs/reference/humanoid-target-fullbody.png` + `humanoid-target-closeup.png`.

- [x] Source the model: GENERATED 2026-07-24 (job
      `b89fb2d4-19ad-45eb-a9ab-f6689a1ccbac`, exact staged params, 35 credits).
      Raw 8.5MB -> gltf-transform draco -> 5.4MB at `public/models/humanoid.glb`.
      101k tris, rigged (24 bones, no clip). Face quality PASSES the
      hero-closeup bar (sculpted features, irises, skull seams) -- Q2 fallback
      (head swap) not needed. Optional later: cleanup pass on shoulder-joint
      texture seams.
- [x] Environment: built into `src/three/humanoid/humanoid-stage.js` -- concrete
      panel walls (procedural noise + seam textures), off-left doorway with
      bright daylight panel, beige carpet, hemisphere + warm back-left key
      (PCF soft shadows) + contact-shadow disc, fog, RoomEnvironment PMREM.
      Matches target framing; final color grade once real copy sits over it.
- [~] Head variant: whole-body fresnel x-ray ShaderMaterial state works
      (`setMaterialMode('xray')`; skinning chunks REQUIRED in custom shaders on
      SkinnedMesh -- bind-pose garbage otherwise). Still to do: head-shell-ONLY
      mask + lit eyes for the Phase 5 reveal.
- [~] Idle animation: procedural breathing/weight-shift sway shipped (no clip in
      the GLB; AnimationMixer path wired if one is added). Head tracking toward
      cursor still to do.
- [x] `/dev/humanoid` harness: frames (FULL/CLOSEUP vs targets), material modes
      (SOURCE/PORCELAIN/XRAY), sliders (rough/metal/env/key/exposure), drag-drop
      GLB preview + `?src=` override. 119 fps desktop with model + room.
      GOTCHA: `Box3.setFromObject` ignores skinning -- HumanoidStage samples
      verts via `applyBoneTransform` to normalize height (raw bbox was 4x off).
      Draco decoder self-hosted at `public/draco/` (copied from three's libs).

## Phase 5 -- The reveal: brain -> head (2-3 days, the signature moment)

BUILT 2026-07-24: `src/three/humanoid/humanoid-reveal.js` (choreography) +
`Reveal.astro` (pinned section, degrades to plain copy) + experience.ts
wiring. Shared modules extracted so /dev/humanoid and the reveal use one
implementation: `humanoid-figure.js` (model/materials/head-tracking/eyes)
+ `humanoid-environment.js` (concrete room, fadeable).

- [x] Pinned transition: brain shrinks 13x (scale 1 -> 0.066, about visual
      center = origin) while camera dives; figure assembles as fresnel
      hologram; head-only x-ray via world-space neck mask in the hybrid
      shader. Captions in src/data/reveal.ts.
- [x] Head closeup orbit, brain pulsing inside the translucent skull,
      eye glows lit (matches humanoid-target-closeup framing).
- [x] Pull-back to full body; room fades up from black (fadeable
      buildConcreteRoom, x-offset -3 so the door glow sits off-left);
      body materializes hologram -> porcelain-lit.
- [x] Scroll-scrubbed + reversible: onLeaveBack resets fully (scale 1,
      camera released to idle orbit); onLeave sets a dimmed backdrop state
      so later sections read over a quiet figure. GLB lazy-loads ~2
      viewports before arrival (never in the critical path).
- [x] Perf gate: 84fps at the heaviest frame (desktop). No LOD swap
      needed yet; revisit on real mobile hardware.
- [ ] Soft snap points between segments (nice-to-have polish).
- NOTE fast-jump edge case: deep-linking straight past the section before
      the GLB loads leaves the normal brain backdrop (by design, no-op).

## Phase 6 -- Content sections + full redesign pass (3-4 days)

- [x] Glass corner-tick cards: `.glass-ticks` utility in global.css (background
      strokes, NOT pseudo-elements -- cards already spend ::after on the glow
      hint) applied to all 17 glass cards across the landing sections.
- [x] Q4 copy consolidation: FounderVision MERGED into Vision.astro (pillars +
      Now/Next/Future roadmap + single ghost-text close), FounderVision.astro
      deleted; Market TRIMMED (answer strip removed -- every number in it was
      already in the table row, VLA cards, or Proof). Competitor table + VLA
      ceiling explainer KEPT intact.
- [x] Q3 font-tech sweep: ALL `font-mono` class usages -> `font-tech` across
      every .astro page/component (landing + inner + pitch) + format.ts +
      scroll-animations.ts selector. JetBrains Mono dropped from the Google
      Fonts load (no code blocks exist site-wide); --font-mono token now
      system-mono only.
- [x] Typographic footer: `src/components/Footer.astro` ("One brain." solid
      / "Any body." outline stroke, echoes the reveal captions; EMAIL /
      FOLLOW / STATUS grid with real links only, link row, Rio Bold LLC
      legal). Wired into index + all 8 inner pages; CTA's old mini-footer
      removed.
- [x] Copy rehousing: landing section copy moved to `src/data/sections.ts`
      (+ reveal captions in `src/data/reveal.ts`). Interpolated accent
      class fragments replaced with literal Tailwind classes.
- [x] One-accent enforcement, landing + inner pages: decorative accents ->
      blue. KEPT semantic color: red = problem/VLA flaws/energy severity,
      green = live status/OSCEN advantage/excitatory, pink = inhibitory
      (architecture 80/20 pair), amber = warnings (Stripe note, retrain
      severity). invest.astro form identity amber -> blue; inner-page
      section spacing mb-10 -> mb-24.
- [x] Phase 2 eyebrow legibility: hero scrim strengthened (radial 0.82/
      0.52) + eyebrow bumped to text-primary.
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
