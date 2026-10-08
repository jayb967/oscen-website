/**
 * /invest body motion. Imported only by the invest section components.
 * Reuses the GSAP + ScrollTrigger already in the shared bundle (the
 * site-wide .reveal batch and .ghost-text emergence stay in
 * scroll-animations.ts; this file adds only invest-specific motion).
 *
 *   [data-countup]  counts from 0 to the number already in the HTML,
 *                   then restores the exact original text.
 *   [data-bar]      energy bars grow (scaleX) to their HTML width.
 *   [data-rail]     step connectors draw (scaleY) when the list enters.
 *
 * Reduced motion or no JS: nothing runs, every final value is visible.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduced) {
  initCountUps();
  initBars();
  initRails();
}

/* ─── Count-ups: "$1.4T", "3,500+ hours", "~10 years", "1,156,800" ─── */
function initCountUps() {
  document.querySelectorAll<HTMLElement>("[data-countup]").forEach((el) => {
    const final = (el.textContent ?? "").trim();
    const m = final.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;

    const decimals = (num.split(".")[1] ?? "").length;
    const grouped = num.includes(",");
    const fmt = (v: number) =>
      pre +
      (grouped
        ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals)) +
      post;

    ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () => {
        // Pin the final width so the shorter in-between values never
        // reflow the card (no layout shift while counting).
        el.style.minWidth = `${el.getBoundingClientRect().width}px`;
        const counter = { v: 0 };
        el.textContent = fmt(0);
        gsap.to(counter, {
          v: target,
          duration: 1.4,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = fmt(decimals ? counter.v : Math.round(counter.v));
          },
          onComplete: () => {
            el.textContent = final;
          },
        });
      },
    });
  });
}

/* ─── Energy bars grow to their real width ─── */
function initBars() {
  const bars = gsap.utils.toArray<HTMLElement>("[data-bar]");
  if (!bars.length) return;
  gsap.set(bars, { scaleX: 0 });
  ScrollTrigger.batch(bars, {
    start: "top 90%",
    once: true,
    onEnter: (batch) => {
      gsap.to(batch, { scaleX: 1, duration: 1.2, stagger: 0.12, ease: "power2.out", delay: 0.2 });
    },
  });
}

/* ─── Step connectors draw once on enter ─── */
function initRails() {
  document.querySelectorAll<HTMLElement>("[data-rail-wrap]").forEach((wrap) => {
    const rail = wrap.querySelector<HTMLElement>("[data-rail]");
    if (!rail) return;
    gsap.fromTo(
      rail,
      { scaleY: 0 },
      {
        scaleY: 1,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: wrap, start: "top 80%", once: true },
      },
    );
  });
}
