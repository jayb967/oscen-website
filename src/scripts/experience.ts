/**
 * SiteExperience (Phase 2) -- owns the persistent three.js layer behind
 * the landing page: BrainStage in a fixed transparent canvas, Lenis
 * smooth scroll bridged to ScrollTrigger, and the brain's scroll
 * choreography. DOM reveal animations stay in scroll-animations.ts.
 *
 * Exposed as window.__experience for the HUD and Hero scripts.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { BrainStage } from "../three/brain/brain-stage.js";
import { AudioController } from "./audio-controller";

declare global {
    interface Window {
        __experience?: {
            stage: BrainStage;
            audio: AudioController;
            state?: any;
            reveal?: any;
        };
    }
}

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function init() {
    const canvasHost = document.getElementById("experience-canvas");
    if (!canvasHost || window.__experience) return;

    // Transparent clear: the giant back-title (z-0) shows through empty
    // space, the brain's particles occlude it -- the depth trick.
    // Phones get a lower DPR cap: at <=768px CSS width the visual loss of
    // 1.5x vs 2x is negligible but the fragment load nearly halves.
    const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
    const stage = new BrainStage(canvasHost, {
        mode: "sim",
        interactive: false,
        clearAlpha: 0,
        maxPixelRatio: isSmallScreen ? 1.5 : 2,
    });

    const audio = new AudioController();
    window.__experience = { stage, audio, state: stageState };

    // Fade the canvas in once the first frames have rendered.
    canvasHost.style.opacity = "0";
    canvasHost.style.transition = "opacity 2s ease";
    requestAnimationFrame(() => requestAnimationFrame(() => {
        canvasHost.style.opacity = "1";
    }));

    // Re-broadcast metrics for the HUD (decouples DOM from the bridge).
    stage.module.bridge.onMetrics((m: any) => {
        window.dispatchEvent(new CustomEvent("oscen:metrics", { detail: m }));
    });
    stage.module.bridge.onStatus((s: string) => {
        window.dispatchEvent(new CustomEvent("oscen:datamode", { detail: s }));
    });
    // The bridge already emitted its initial status before we subscribed.
    window.dispatchEvent(
        new CustomEvent("oscen:datamode", { detail: stage.module.bridge.mode }),
    );

    if (!prefersReduced) {
        initSmoothScroll();
        initHeroScene(stage);
        initCopyAsideScene(stage);
        initHowItWorksScene(stage);
        initRevealScene(stage);
    }
}

/**
 * Named brain states so every scene speaks the same vocabulary.
 * Bloom values live in the CINEMATIC regime: BrainStage hard-caps strength
 * at 0.34 (threshold 0.80) so only firing regions + pulses glow. The old
 * 1.0/0.45/0.9 vocabulary was tuned for the classic renderer and would all
 * clamp flat at the cap.
 */
const MOODS = {
    hero: { dim: 0, bloom: 0.34 },         // full presence behind the hero
    backdrop: { dim: 0.75, bloom: 0.16 },  // quiet behind copy sections
    focus: { dim: 0.3, bloom: 0.3 },       // pinned scenes: bright, one region flared
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * Live mood + orbit state shared by every scene. Scrubbed scenes write it
 * directly; discrete hand-offs (pinned-scene enter/leave, step changes)
 * tween it, so the brain always glides from wherever the previous scene
 * left it instead of popping to the new pose.
 */
const stageState = {
    mood: { ...MOODS.hero },
    orbit: { radius: Math.hypot(14, 8), height: 4 },
};

function applyStageState(stage: BrainStage) {
    stage.module.setDim(stageState.mood.dim);
    stage.setBloomStrength(stageState.mood.bloom);
    stage.setOrbit(stageState.orbit);
}

function setMood(stage: BrainStage, mood: { dim: number; bloom: number }) {
    gsap.killTweensOf(stageState.mood);
    Object.assign(stageState.mood, mood);
    applyStageState(stage);
}

function tweenMood(stage: BrainStage, mood: { dim: number; bloom: number }, duration = 1) {
    gsap.to(stageState.mood, {
        ...mood, duration, ease: "power2.inOut", overwrite: true,
        onUpdate: () => applyStageState(stage),
    });
}

function setOrbit(stage: BrainStage, orbit: { radius: number; height: number }) {
    gsap.killTweensOf(stageState.orbit);
    Object.assign(stageState.orbit, orbit);
    applyStageState(stage);
}

function tweenOrbit(stage: BrainStage, orbit: { radius: number; height: number }, duration = 1) {
    gsap.to(stageState.orbit, {
        ...orbit, duration, ease: "power2.inOut", overwrite: true,
        onUpdate: () => applyStageState(stage),
    });
}

/** Lenis drives scroll; GSAP's ticker drives Lenis; ScrollTrigger listens. */
function initSmoothScroll() {
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
}

/**
 * Hero: camera dollies back and the brain settles from `hero` to
 * `backdrop` mood as you scroll into the content. The giant back-title
 * fades slightly ahead of it.
 */
function initHeroScene(stage: BrainStage) {
    const hero = document.getElementById("hero");
    const backTitle = document.getElementById("experience-title");
    if (!hero) return;

    const ORBIT_START = { radius: Math.hypot(14, 8), height: 4 };
    const ORBIT_END = { radius: 23, height: 6.5 };

    ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: 0.8,
        onUpdate: (self) => {
            const p = self.progress;
            setOrbit(stage, {
                radius: lerp(ORBIT_START.radius, ORBIT_END.radius, p),
                height: lerp(ORBIT_START.height, ORBIT_END.height, p),
            });
            setMood(stage, {
                dim: lerp(MOODS.hero.dim, MOODS.backdrop.dim, p),
                bloom: lerp(MOODS.hero.bloom, MOODS.backdrop.bloom, p),
            });
            if (backTitle) {
                backTitle.style.opacity = String(Math.max(0, 1 - p * 1.6));
            }
        },
    });
}

/**
 * Copy sections (Problem -> Proof): the dimmed brain glides to the right
 * side of the viewport so the centered text and stat cards stay clear,
 * holds there, then glides back to center as the How It Works
 * explanation section scrolls in. Both moves are scrubbed, never snapped.
 */
const COPY_ASIDE_PAN = 13; // world units of camera strafe at orbit radius ~23
function initCopyAsideScene(stage: BrainStage) {
    const slideOut = document.getElementById("problem");
    const slideBack = document.getElementById("how-it-works");
    if (!slideOut || !slideBack) return;

    ScrollTrigger.create({
        trigger: slideOut,
        start: "top bottom",
        end: "top top",
        scrub: 0.8,
        onUpdate: (self) => stage.setLateralOffset(COPY_ASIDE_PAN * self.progress),
    });
    ScrollTrigger.create({
        trigger: slideBack,
        start: "top bottom",
        end: "top top",
        scrub: 0.8,
        onUpdate: (self) => stage.setLateralOffset(COPY_ASIDE_PAN * (1 - self.progress)),
    });
}

/**
 * How It Works: pin the section for one viewport per step. Each step
 * cross-fades its caption, glides the camera to its brain region, and
 * flares that region's firing rate through the real data bridge.
 * The section renders as a plain list until .hiw-pinned is added here.
 */
function initHowItWorksScene(stage: BrainStage) {
    const section = document.getElementById("how-it-works");
    if (!section) return;
    const captions = Array.from(
        section.querySelectorAll<HTMLElement>("[data-stage]"),
    );
    if (!captions.length) return;

    section.classList.add("hiw-pinned");

    // Per-step orbit poses: gentle radius/height drift keeps the glide alive.
    const ORBITS = [
        { radius: 13, height: 3 },
        { radius: 12, height: 5 },
        { radius: 11, height: 4 },
        { radius: 12, height: 2.5 },
        { radius: 13, height: 5.5 },
    ];

    let active = -1;
    const header = section.querySelector<HTMLElement>(".hiw-header");

    const showCaption = (i: number) => {
        const prev = captions[active];
        const next = captions[i];
        active = i;
        if (prev) {
            gsap.to(prev, { opacity: 0, y: -24, duration: 0.35, ease: "power2.in", overwrite: true });
        }
        gsap.fromTo(
            next,
            { opacity: 0, y: 32 },
            { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", delay: prev ? 0.15 : 0, overwrite: true },
        );
        // Header yields to the captions after the first step.
        if (header) {
            gsap.to(header, { opacity: i === 0 ? 1 : 0.2, duration: 0.5, overwrite: true });
        }

        const region = next.dataset.region!;
        stage.focusRegion(region);
        // Long eased glide instead of a pose snap -- entering the section
        // this carries the camera all the way in from the backdrop orbit
        // (radius 23), which is the "brain pops to size" fix.
        tweenOrbit(stage, ORBITS[i % ORBITS.length], 1.6);
        // Flare the step's region on top of organic activity (~5s decay).
        stage.module.bridge.applyOverride({ [region]: 0.18 });
    };

    const leave = (restoreMood = true) => {
        stage.focusRegion(null);
        stage.module.bridge.clearOverride();
        if (restoreMood) tweenMood(stage, MOODS.backdrop, 1.0);
    };

    ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () => "+=" + captions.length * window.innerHeight,
        pin: true,
        scrub: 0.8,
        onEnter: () => tweenMood(stage, MOODS.focus, 1.2),
        onEnterBack: () => tweenMood(stage, MOODS.focus, 1.2),
        onLeave: () => leave(),
        onLeaveBack: () => leave(),
        onUpdate: (self) => {
            const i = Math.min(
                captions.length - 1,
                Math.floor(self.progress * captions.length),
            );
            if (i !== active) {
                showCaption(i);
            } else if (
                !gsap.isTweening(stageState.orbit) &&
                Math.abs(stageState.orbit.radius - ORBITS[i % ORBITS.length].radius) > 0.1
            ) {
                // Heal after a writer race (e.g. a deep link lands here while
                // the hero scrub is still flushing): re-run the step glide.
                tweenOrbit(stage, ORBITS[i % ORBITS.length], 1.6);
            }
        },
    });
}

/**
 * The Reveal (Phase 5): pinned 3.5-viewport scrub. The brain shrinks
 * into the humanoid's head (humanoid-reveal.js owns the 3D choreography;
 * this owns the ScrollTrigger, lazy loading, and caption swaps).
 * The 5.4MB GLB loads only when the visitor approaches the section.
 */
function initRevealScene(stage: BrainStage) {
    const section = document.getElementById("reveal");
    if (!section) return;
    const captions = Array.from(section.querySelectorAll<HTMLElement>("[data-step]"));
    if (!captions.length) return;

    section.classList.add("rvl-pinned");
    // Captured BEFORE the pin trigger wraps `section` in its spacer div,
    // after which nextElementSibling no longer reaches the next section.
    const afterReveal = section.nextElementSibling;

    let reveal: any = null;
    let loadStarted = false;
    let lastProgress = 0;
    let entered = false;

    const ensureLoaded = () => {
        if (loadStarted) return;
        loadStarted = true;
        import("../three/humanoid/humanoid-reveal.js")
            .then((m) => m.createReveal(stage))
            .then((r) => {
                reveal = r;
                if (window.__experience) window.__experience.reveal = r;
                // Scrub may already be mid-flight when the GLB lands.
                if (entered) {
                    reveal.enter();
                    reveal.setProgress(lastProgress);
                }
            })
            .catch((err) => console.error("[reveal] humanoid load failed", err));
    };

    // Preload well before arrival (~two viewports out).
    ScrollTrigger.create({
        trigger: section,
        start: "top bottom+=200%",
        once: true,
        onEnter: ensureLoaded,
    });

    // Caption boundaries align with the choreography segments.
    const STEP_RANGES = [0.0, 0.4, 0.7];
    let active = -1;
    const header = section.querySelector<HTMLElement>(".rvl-header");

    const showCaption = (i: number) => {
        const prev = captions[active];
        const next = captions[i];
        active = i;
        if (prev) {
            gsap.to(prev, { opacity: 0, y: -24, duration: 0.35, ease: "power2.in", overwrite: true });
        }
        gsap.fromTo(
            next,
            { opacity: 0, y: 32 },
            { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", delay: prev ? 0.15 : 0, overwrite: true },
        );
        if (header) {
            gsap.to(header, { opacity: i === 0 ? 1 : 0, duration: 0.5, overwrite: true });
        }
    };

    ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () => "+=" + 3.5 * window.innerHeight,
        pin: true,
        scrub: true,
        onEnter: () => {
            entered = true;
            // The reveal scrub owns bloom directly from here; stop any
            // in-flight mood tween so the two don't fight over it.
            gsap.killTweensOf(stageState.mood);
            ensureLoaded();
            reveal?.enter();
        },
        onEnterBack: () => {
            entered = true;
            gsap.killTweensOf(stageState.mood);
            reveal?.enter();
        },
        onLeave: () => {
            entered = false;
            reveal?.setBackdrop();
        },
        onLeaveBack: () => {
            entered = false;
            reveal?.reset();
            tweenMood(stage, MOODS.backdrop, 1.0);
        },
        onUpdate: (self) => {
            lastProgress = self.progress;
            reveal?.setProgress(self.progress);
            let i = 0;
            for (let s = STEP_RANGES.length - 1; s >= 0; s--) {
                if (self.progress >= STEP_RANGES[s]) { i = s; break; }
            }
            if (i !== active) showCaption(i);
        },
    });

    // Outro: from the end of the pinned reveal to the footer's arrival
    // the figure slowly turns one full revolution, landing front-facing
    // in a head-and-shoulders portrait just before the (opaque) footer
    // slides over it. The next section's top hitting the viewport bottom
    // coincides with the pin release, so outro p=0 lines up with reveal
    // p=1.
    const footer = document.querySelector("footer");
    if (afterReveal) {
        ScrollTrigger.create({
            trigger: afterReveal,
            start: "top bottom",
            endTrigger: footer ?? document.body,
            end: footer ? "top bottom" : "bottom bottom",
            scrub: 0.8,
            onUpdate: (self) => reveal?.setOutro(self.progress),
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
