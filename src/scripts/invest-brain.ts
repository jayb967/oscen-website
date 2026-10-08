/**
 * /invest hero: copy intro, scroll parallax, and the lazily mounted brain.
 *
 * Performance contract (paid traffic, mostly phones):
 * - Nothing here touches the LCP. The headline and sub paint from static HTML
 *   and rise in CSS; this module only animates the secondary copy.
 * - three.js + BrainStage load through a dynamic import(), so they live in
 *   a lazy chunk, fetched only once the page is idle AND the hero is on
 *   screen. Reduced motion, Save-Data, deviceMemory <= 2 or no WebGL keep
 *   the static CSS fallback instead.
 * - BrainStage pauses itself when its container leaves the viewport or the
 *   tab is hidden (its own IntersectionObserver + visibilitychange).
 * - Simulated data only (mode "sim"): no network calls besides the local
 *   brain.glb shell + Draco decoder fetched by the cinematic layer.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Stage = import("../three/brain/brain-stage.js").BrainStage;

declare global {
  interface Window {
    __investBrain?: Stage;
  }
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = window.matchMedia("(max-width: 768px)").matches;
const desktop = window.matchMedia("(min-width: 1024px)").matches;

// Idle orbit pose (matches the homepage hero) and the dolly-back pose the
// scroll scrub glides to as the hero leaves the viewport.
// Desktop pulls back a little so the brain sits beside the copy, not
// under it; phones keep the homepage framing behind the scrim.
// Phones pull back further and dim, since the copy sits on top of it.
const ORBIT_START = desktop ? { radius: 20, height: 4 } : { radius: 27, height: 5 };
const ORBIT_END = { radius: desktop ? 27 : 33, height: 6.5 };
const BASE_DIM = desktop ? 0 : 0.12;
// Camera strafe that parks the brain to the right of the copy on desktop.
const DESKTOP_PAN = 7;

function introCopy() {
  const root = document.documentElement;
  if (reduced || !root.classList.contains("inv-intro")) return;
  const items = gsap.utils.toArray<HTMLElement>("#invest-hero [data-inv-intro]");
  if (!items.length) return;
  const cue = document.getElementById("invest-hero-cue");
  const copy = items.filter((el) => el !== cue);
  // Inline styles now own these items, so the component's 2.5s failsafe
  // (which drops the class) can no longer pop them mid-tween. The class
  // stays so the CSS headline/sub rise is not cut short.
  gsap.set(items, { opacity: 0, y: 16 });
  const tl = gsap.timeline({ delay: 0.25 });
  tl.to(copy, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.1 });
  if (cue) tl.to(cue, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.2");
}

function canRun3D(): boolean {
  if (reduced) return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return false;
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const go = () => {
      const ric = (window as any).requestIdleCallback;
      if (typeof ric === "function") ric(() => resolve(), { timeout: 2500 });
      else setTimeout(resolve, 1200);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    // Slow third-party tags can hold "load" back; never wait on them long.
    setTimeout(go, 4000);
  });
}

function whenInView(el: Element): Promise<void> {
  return new Promise((resolve) => {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        resolve();
      }
    });
    io.observe(el);
  });
}

async function mountBrain(hero: HTMLElement, host: HTMLElement, fallback: HTMLElement | null) {
  // Both gates first; the import() below is the only path to three.js.
  await Promise.all([whenIdle(), whenInView(hero)]);
  if (!canRun3D()) return;

  performance.mark("invest-brain-import-start");
  const { BrainStage } = await import("../three/brain/brain-stage.js");
  performance.mark("invest-brain-import-end");

  const stage = new BrainStage(host, {
    mode: "sim",
    interactive: false,
    clearAlpha: 0,
    maxPixelRatio: small ? 1.25 : 2,
    maxQuality: small ? "low" : null,
  });
  window.__investBrain = stage;
  stage.setOrbit(ORBIT_START);
  stage.module.setDim(BASE_DIM);
  if (desktop) stage.setLateralOffset(DESKTOP_PAN);

  // Fade in once the first frames have rendered (homepage idiom), then
  // retire the CSS stand-in.
  host.style.transition = "opacity 1.8s ease";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    host.style.opacity = "1";
    if (fallback) fallback.style.opacity = "0";
  }));

  // Soft mouse parallax (desktop pointers only; touch never fires these).
  hero.addEventListener("mousemove", (e) => {
    stage.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  });
  hero.addEventListener("mouseleave", () => stage.setPointer(0, 0));

  // Dolly back + dim as the hero scrolls away; the layer transform/opacity
  // scrub lives in initParallax so the fallback gets it too.
  ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: "bottom top",
    scrub: 0.8,
    onUpdate: (self) => {
      const p = self.progress;
      stage.setOrbit({
        radius: ORBIT_START.radius + (ORBIT_END.radius - ORBIT_START.radius) * p,
        height: ORBIT_START.height + (ORBIT_END.height - ORBIT_START.height) * p,
      });
      stage.module.setDim(BASE_DIM + (0.6 - BASE_DIM) * p);
    },
  });
}

function initParallax(hero: HTMLElement, layer: HTMLElement) {
  if (reduced) return;
  // Transform + opacity only: compositor-friendly on mid-range phones.
  gsap.to(layer, {
    yPercent: 18,
    opacity: 0.35,
    ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 },
  });
  const cue = document.getElementById("invest-hero-cue");
  if (cue) {
    // Children, not the cue itself: the intro timeline owns the cue's opacity.
    gsap.to(cue.children, {
      autoAlpha: 0,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "2% top", end: "14% top", scrub: true },
    });
  }
}

/** "See what's built" must land even if the section id is ever renamed. */
function wireBuiltLink() {
  const link = document.querySelector<HTMLAnchorElement>('#invest-hero [data-inv-cta="built"]');
  if (!link || document.getElementById("whats-built")) return;
  link.addEventListener("click", (e) => {
    const heading = Array.from(document.querySelectorAll("main h2")).find((h) =>
      /what.s built/i.test(h.textContent ?? ""),
    );
    const target = heading?.closest("section") ?? document.querySelector("#invest-hero + section");
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  });
}

function init() {
  const hero = document.getElementById("invest-hero");
  const layer = document.getElementById("invest-brain");
  const host = document.getElementById("invest-brain-canvas");
  if (!hero || !layer || !host) return;
  introCopy();
  initParallax(hero, layer);
  wireBuiltLink();
  mountBrain(hero, host, document.getElementById("invest-brain-fallback")).catch((e) => {
    // The static fallback stays up; the page is unaffected.
    console.warn("[invest-brain] 3D hero skipped:", e);
  });
}

init();
