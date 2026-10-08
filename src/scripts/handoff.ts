/**
 * Page hand-off animations for <HandoffOverlay />.
 *
 * leaveForSupport(origin)  /invest -> /support after a non-accredited inquiry.
 * arriveFromInvest()       /support entry reveal when loaded with ?from=invest.
 *
 * Same idiom as scroll-animations.ts: power3 for the big moves, power2.out
 * with a small y offset for copy, everything skipped under reduced motion.
 */
import gsap from "gsap";

const SUPPORT_URL = "/support?from=invest";
/** Long enough to read the three lines of copy before we move. */
const READ_SECONDS = 6.5;

const prefersReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function parts() {
  const root = document.getElementById("handoff");
  if (!root) return null;
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel);
  return {
    root,
    bg: q<HTMLElement>("[data-handoff-bg]"),
    neuron: q<HTMLElement>("[data-handoff-neuron]"),
    items: root.querySelectorAll<HTMLElement>("[data-handoff-item]"),
    fill: q<HTMLElement>("[data-handoff-fill]"),
    spike: q<HTMLElement>("[data-handoff-spike]"),
    go: q<HTMLAnchorElement>("[data-handoff-go]"),
    stay: q<HTMLButtonElement>("[data-handoff-stay]"),
  };
}

/** Circle radius that covers the whole viewport from point (x, y). */
function coverRadius(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
}

/**
 * `onStay` runs when the overlay is dismissed without leaving: the visitor
 * pressed "Stay here", or came back with the Back button and the browser
 * restored this page from its back/forward cache. The caller then shows its
 * normal success state.
 */
export function leaveForSupport(origin?: HTMLElement | null, onStay?: () => void) {
  const p = parts();
  if (!p) {
    window.location.assign(SUPPORT_URL);
    return;
  }

  let tl: gsap.core.Timeline | null = null;
  let timer = 0;
  // Everything behind the overlay goes inert so focus can't wander under it.
  const behind = [...document.body.children].filter((el) => el !== p.root) as HTMLElement[];

  let dismissed = false;
  let left = false;
  const onKey = (e: KeyboardEvent) => {
    // A modal dialog closes on Escape, same as "Stay here".
    if (e.key === "Escape" && !left) dismiss();
  };
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    tl?.kill();
    window.clearTimeout(timer);
    document.removeEventListener("keydown", onKey);
    p.root.classList.add("hidden");
    document.documentElement.style.overflow = "";
    behind.forEach((el) => el.removeAttribute("inert"));
    onStay?.();
  };
  window.addEventListener("pageshow", (e) => e.persisted && dismiss(), { once: true });
  p.stay?.addEventListener("click", dismiss, { once: true });
  document.addEventListener("keydown", onKey);

  const go = () => {
    if (left || dismissed) return;
    left = true;
    window.location.assign(SUPPORT_URL);
  };

  p.root.classList.remove("hidden");
  document.documentElement.style.overflow = "hidden";
  behind.forEach((el) => el.setAttribute("inert", ""));
  p.go?.focus({ preventScroll: true });
  p.go?.addEventListener("click", (e) => {
    e.preventDefault();
    go();
  });

  if (prefersReduced()) {
    gsap.set(p.fill, { scaleX: 1 });
    gsap.set(p.spike, { opacity: 0 });
    timer = window.setTimeout(go, READ_SECONDS * 1000);
    return;
  }

  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const r = coverRadius(x, y);

  tl = gsap.timeline();
  tl.fromTo(
    p.bg,
    { clipPath: `circle(0px at ${x}px ${y}px)` },
    { clipPath: `circle(${r}px at ${x}px ${y}px)`, duration: 0.9, ease: "power3.inOut" },
  )
    .fromTo(p.neuron, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.6)" }, "-=0.25")
    .fromTo(p.items, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: "power2.out" }, "-=0.35")
    // The "axon": a spike travels the line while the fill follows it.
    .addLabel("axon")
    .fromTo(p.fill, { scaleX: 0 }, { scaleX: 1, duration: READ_SECONDS, ease: "none" }, "axon")
    .fromTo(p.spike, { left: "0%" }, { left: "100%", duration: READ_SECONDS, ease: "none" }, "axon")
    .to(p.items, { y: -16, opacity: 0, duration: 0.35, stagger: 0.04, ease: "power2.in" })
    .to(p.neuron, { scale: 2.4, opacity: 0, duration: 0.45, ease: "power2.in" }, "<")
    .add(go);
}

export function arriveFromInvest() {
  // Drop the marker so a refresh or a shared link doesn't replay this.
  const url = new URL(window.location.href);
  url.searchParams.delete("from");
  history.replaceState(null, "", url.pathname + url.search + url.hash);

  // Not armed = reduced motion (the inline script never showed the overlay).
  const p = parts();
  if (!p || p.root.dataset.armed !== "1") return;

  const x = window.innerWidth / 2;
  const y = window.innerHeight / 2;
  const r = coverRadius(x, y);

  gsap
    .timeline({ onComplete: () => p.root.classList.add("hidden") })
    .fromTo(p.neuron, { scale: 1, opacity: 1 }, { scale: 0.2, opacity: 0, duration: 0.45, ease: "power2.in" }, 0.15)
    .fromTo(
      p.bg,
      { clipPath: `circle(${r}px at ${x}px ${y}px)` },
      { clipPath: `circle(0px at ${x}px ${y}px)`, duration: 0.9, ease: "power3.inOut" },
      0.35,
    );
}
