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
    window.__experience = { stage, audio };

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
        initHowItWorksScene(stage);
    }
}

/** Named brain states so every scene speaks the same vocabulary. */
const MOODS = {
    hero: { dim: 0, bloom: 1.0 },        // full presence behind the hero
    backdrop: { dim: 0.75, bloom: 0.45 }, // quiet behind copy sections
    focus: { dim: 0.3, bloom: 0.9 },      // pinned scenes: bright, one region flared
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function applyMood(stage: BrainStage, mood: { dim: number; bloom: number }) {
    stage.module.setDim(mood.dim);
    stage.setBloomStrength(mood.bloom);
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
        scrub: true,
        onUpdate: (self) => {
            const p = self.progress;
            stage.setOrbit({
                radius: lerp(ORBIT_START.radius, ORBIT_END.radius, p),
                height: lerp(ORBIT_START.height, ORBIT_END.height, p),
            });
            applyMood(stage, {
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
        stage.setOrbit(ORBITS[i % ORBITS.length]);
        // Flare the step's region on top of organic activity (~5s decay).
        stage.module.bridge.applyOverride({ [region]: 0.18 });
    };

    const leave = (restoreMood = true) => {
        stage.focusRegion(null);
        stage.module.bridge.clearOverride();
        if (restoreMood) applyMood(stage, MOODS.backdrop);
    };

    ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () => "+=" + captions.length * window.innerHeight,
        pin: true,
        scrub: true,
        onEnter: () => applyMood(stage, MOODS.focus),
        onEnterBack: () => applyMood(stage, MOODS.focus),
        onLeave: () => leave(),
        onLeaveBack: () => leave(),
        onUpdate: (self) => {
            const i = Math.min(
                captions.length - 1,
                Math.floor(self.progress * captions.length),
            );
            if (i !== active) showCaption(i);
        },
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
