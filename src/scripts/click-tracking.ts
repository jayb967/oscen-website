/**
 * First-party click and scroll analytics, stored in Cloudflare.
 *
 * Every click on a link, button or [data-cta] element, and scroll depth
 * milestones (25/50/75/100%), are sent via analytics-core.ts to oscen.ai/e,
 * a Cloudflare Worker (oscen-events) that writes them to the Cloudflare
 * Analytics Engine dataset "oscen_clicks". Time on page and per section is
 * engagement.ts.
 *
 * Anonymous and cookieless: no identifiers, no form values, no emails. Only
 * what was clicked (data-cta / id / short visible label / link target), the
 * page, the section, campaign source (first-touch UTM from attribution.ts),
 * device class and scroll position. Page views and visitors come from
 * Cloudflare Web Analytics, which is enabled on the zone.
 */

import { analyticsEnabled, send } from "./analytics-core";

/** Short, non-sensitive label for an element: its visible text, trimmed. */
function label(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  const text = (aria || el.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
}

/** Where a link goes: same-site path, or the external host. */
function target(el: HTMLElement): string | undefined {
  const href = el.getAttribute("href");
  if (!href) return undefined;
  if (href.startsWith("#")) return href;
  try {
    const u = new URL(href, location.href);
    return u.host === location.host ? u.pathname + u.hash : u.host;
  } catch {
    return undefined;
  }
}

function onClick(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest<HTMLElement>("a, button, [data-cta], summary, [role='button']");
  if (!el) return;
  // Never report anything typed into forms; buttons inside forms report their own label only.
  const section = el.closest<HTMLElement>("section[id], [data-section]");
  send({
    type: "click",
    // Named CTAs first, then support tier buttons (data-tier), then id, then tag.
    target: el.dataset.cta || (el.dataset.tier ? `tier-${el.dataset.tier}` : "") || el.id || el.tagName.toLowerCase(),
    label: label(el),
    href: target(el),
    section: section?.dataset.section || section?.id || undefined,
    y: Math.round(window.scrollY + el.getBoundingClientRect().top),
  });
}

function trackScrollDepth() {
  const sent = new Set<number>();
  const marks = [25, 50, 75, 100];
  let ticking = false;
  const check = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max <= 0 ? 100 : Math.round((window.scrollY / max) * 100);
    for (const m of marks) {
      if (pct >= m && !sent.has(m)) {
        sent.add(m);
        send({ type: "scroll", target: `depth-${m}`, label: `${m}%` });
      }
    }
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(check);
      }
    },
    { passive: true },
  );
}

if (analyticsEnabled) {
  document.addEventListener("click", onClick, { capture: true, passive: true });
  trackScrollDepth();
}

export {};
