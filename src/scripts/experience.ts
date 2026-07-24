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
    const stage = new BrainStage(canvasHost, {
        mode: "sim",
        interactive: false,
        clearAlpha: 0,
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
        initChoreography(stage);
    }
}

/** Lenis drives scroll; GSAP's ticker drives Lenis; ScrollTrigger listens. */
function initSmoothScroll() {
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
}

/**
 * Hero: camera dollies back and the brain dims/settles as you scroll
 * into the content. The giant back-title fades slightly ahead of it.
 * (Phase 3 will extend this timeline with the pinned explainer scenes.)
 */
function initChoreography(stage: BrainStage) {
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
                radius: ORBIT_START.radius + (ORBIT_END.radius - ORBIT_START.radius) * p,
                height: ORBIT_START.height + (ORBIT_END.height - ORBIT_START.height) * p,
            });
            stage.module.setDim(p * 0.75);
            stage.setBloomStrength(1.0 - p * 0.55);
            if (backTitle) {
                backTitle.style.opacity = String(Math.max(0, 1 - p * 1.6));
            }
        },
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
