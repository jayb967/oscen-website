/**
 * Time on page and time per section, for reworking pages from real data.
 *
 * Counts ACTIVE time only: the tab is visible and the visitor did something
 * (moved, scrolled, tapped, typed) in the last 30 seconds, so a tab left open
 * all afternoon does not inflate anything. Each active second is credited to
 * the page and to the section crossing the middle of the screen.
 *
 * Sent through analytics-core.ts when the visitor leaves or switches tabs
 * (visibilitychange hidden / pagehide), as deltas since the last send, so
 * returning to the tab and leaving again never double counts:
 *   type "page":    target = path, label "view" on the first send of this page
 *                   view else "more", ms = active ms, visible_ms, max_scroll,
 *                   engaged = interacted or 10+ active seconds.
 *   type "section": target = section name, ms = active ms in that section.
 * Section names: data-section, else id, else a slug of its first heading.
 */
import { analyticsEnabled, send } from "./analytics-core";

const ACTIVE_WINDOW_MS = 30_000;
const TICK_MS = 1_000;
const ENGAGED_MS = 10_000;

let lastActive = 0;
let interacted = false;
let maxScroll = 0;
let activeMs = 0;
let visibleMs = 0;
let totalActiveMs = 0;
let sentView = false;
const sectionMs = new Map<string, number>();

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

let sections: { el: HTMLElement; name: string }[] = [];
function collectSections() {
  const seen = new Set<HTMLElement>();
  const els = [...document.querySelectorAll<HTMLElement>("[data-section], main section, main > div[id]")].filter((el) => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });
  sections = els.map((el, i) => {
    const heading = el.querySelector("h1, h2, h3")?.textContent ?? "";
    const name = el.dataset.section || el.id || slug(heading) || `section-${i + 1}`;
    return { el, name };
  });
}

/** The most specific section crossing the vertical middle of the viewport. */
function sectionAtCenter(): string | undefined {
  const mid = window.innerHeight / 2;
  let best: { name: string; h: number } | undefined;
  for (const s of sections) {
    const r = s.el.getBoundingClientRect();
    if (r.height > 0 && r.top <= mid && r.bottom >= mid && (!best || r.height < best.h)) best = { name: s.name, h: r.height };
  }
  return best?.name;
}

function markActive() {
  lastActive = Date.now();
  interacted = true;
}

function onScroll() {
  lastActive = Date.now();
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max <= 0 ? 100 : Math.min(100, Math.round((window.scrollY / max) * 100));
  if (pct > maxScroll) maxScroll = pct;
}

function tick() {
  if (document.visibilityState !== "visible") return;
  visibleMs += TICK_MS;
  if (Date.now() - lastActive > ACTIVE_WINDOW_MS) return;
  activeMs += TICK_MS;
  totalActiveMs += TICK_MS;
  const name = sectionAtCenter();
  if (name) sectionMs.set(name, (sectionMs.get(name) ?? 0) + TICK_MS);
}

function flush() {
  if (visibleMs === 0 && activeMs === 0) return;
  const events: Record<string, unknown>[] = [
    {
      type: "page",
      target: location.pathname,
      label: sentView ? "more" : "view",
      ms: activeMs,
      visible_ms: visibleMs,
      max_scroll: maxScroll,
      engaged: interacted || totalActiveMs >= ENGAGED_MS ? 1 : 0,
    },
  ];
  [...sectionMs.entries()]
    .filter(([, ms]) => ms >= TICK_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, ms]) => events.push({ type: "section", target: name, ms }));
  send(events);
  sentView = true;
  activeMs = 0;
  visibleMs = 0;
  sectionMs.clear();
}

if (analyticsEnabled) {
  lastActive = Date.now(); // Arriving counts as activity for the first window.
  collectSections();
  window.addEventListener("load", collectSections, { once: true });
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) {
    window.addEventListener(ev, markActive, { passive: true });
  }
  let lastMove = 0;
  window.addEventListener(
    "pointermove",
    () => {
      const now = Date.now();
      if (now - lastMove > 1000) {
        lastMove = now;
        markActive();
      }
    },
    { passive: true },
  );
  window.addEventListener("scroll", onScroll, { passive: true });
  window.setInterval(tick, TICK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else lastActive = Date.now();
  });
  window.addEventListener("pagehide", flush);
}

export {};
