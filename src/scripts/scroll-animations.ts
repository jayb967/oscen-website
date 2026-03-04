/**
 * GSAP ScrollTrigger animations for OSCEN v2.
 * Cinematic, minimal. Opacity-emergence + parallax + ghost-text reveals.
 * 6 sections: Hero, Problem, Solution, Proof, Vision, CTA.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

if (prefersReduced) {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
  document.querySelectorAll(".ghost-text").forEach((el) => el.classList.add("emerged"));
} else {
  initAnimations();
}

function initAnimations() {
  // Kill CSS transitions — GSAP handles everything
  const style = document.createElement("style");
  style.textContent = `.reveal { transition: none !important; }`;
  document.head.appendChild(style);

  animateHero();
  animateReveals();
  animateGhostText();
  animateFlipCards();

  window.addEventListener("load", () => ScrollTrigger.refresh());
}

/* ─── Hero: Staggered entrance + parallax exit ─── */
function animateHero() {
  const hero = document.getElementById("hero");
  if (!hero) return;

  const title = document.getElementById("hero-title");
  const stats = document.getElementById("hero-stats");
  const scroll = document.getElementById("hero-scroll");
  const content = hero.querySelector(".relative.z-10");

  // Entrance sequence
  const tl = gsap.timeline({ delay: 0.4 });

  if (title) {
    gsap.set(title, { opacity: 0, y: 30 });
    tl.to(title, { opacity: 1, y: 0, duration: 1.2, ease: "power3.out" });
  }
  if (stats) {
    gsap.set(stats, { opacity: 0 });
    tl.to(stats, { opacity: 1, duration: 1.0, ease: "power2.out" }, "-=0.3");
  }
  if (scroll) {
    gsap.set(scroll, { opacity: 0 });
    tl.to(scroll, { opacity: 0.5, duration: 0.6 }, "-=0.2");
  }

  // Parallax exit on scroll
  if (content) {
    gsap.to(content, {
      y: -60,
      opacity: 0,
      ease: "none",
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });
  }
  if (scroll) {
    gsap.to(scroll, {
      opacity: 0,
      scrollTrigger: {
        trigger: hero,
        start: "8% top",
        end: "20% top",
        scrub: true,
      },
    });
  }

  // Brain viz zoom: grows as user scrolls through hero
  const brainFrame = document.getElementById("brain-frame") as HTMLIFrameElement | null;
  if (brainFrame) {
    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: (self) => {
        brainFrame.contentWindow?.postMessage({ zoom: self.progress }, "*");
      },
    });
  }
}

/* ─── Batch reveal for all .reveal elements ─── */
function animateReveals() {
  const reveals = gsap.utils.toArray<HTMLElement>("section:not(#hero) .reveal");
  gsap.set(reveals, { opacity: 0, y: 24 });

  ScrollTrigger.batch(reveals, {
    onEnter: (batch) => {
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        stagger: 0.06,
        ease: "power2.out",
        overwrite: true,
      });
    },
    start: "top 88%",
    once: true,
  });
}

/* ─── Ghost text: emerges from near-invisible on scroll ─── */
function animateGhostText() {
  document.querySelectorAll<HTMLElement>(".ghost-text").forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: "top 80%",
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          duration: 1.2,
          ease: "power2.out",
        });
      },
    });
  });
}

/* ─── Flip cards: subtle entrance stagger ─── */
function animateFlipCards() {
  document.querySelectorAll<HTMLElement>(".flip-card").forEach((card) => {
    // Entrance is already handled by .reveal batch
    // Add a subtle scale pulse on first scroll-in
    ScrollTrigger.create({
      trigger: card,
      start: "top 85%",
      once: true,
      onEnter: () => {
        const front = card.querySelector(".flip-front");
        if (front) {
          gsap.fromTo(
            front.querySelector(".font-mono"),
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.2)", delay: 0.1 },
          );
        }
      },
    });
  });
}
