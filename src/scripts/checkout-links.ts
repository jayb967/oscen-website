/**
 * Campaign attribution for Stripe Payment Links.
 *
 * Every buy.stripe.com link on the page gets client_reference_id=<token>, a
 * random token made once per page view. When a visitor clicks one (or opens it
 * in a new tab), the first-touch attribution captured by attribution.ts is
 * beaconed under that token to /.netlify/functions/checkout-attribution, which
 * the CRM joins to the purchase when Stripe's webhook arrives.
 *
 * Navigation never waits on the beacon, and without JavaScript the links are
 * untouched and still work. The ok/tier/session_id return URL is configured on
 * the Payment Link itself and is unaffected. Same first-party data the First in
 * Line and inquiry forms send (UTMs, landing page, referrer; no ad click ids).
 */

const STRIPE_LINK = 'a[href^="https://buy.stripe.com/"]';
const ENDPOINT = "/.netlify/functions/checkout-attribution";

function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `oa_${b64}`;
}

let token: string | null = null;
function pageToken(): string {
  if (!token) token = newToken();
  return token;
}

function decorate(a: HTMLAnchorElement) {
  try {
    const url = new URL(a.href);
    if (url.searchParams.get("client_reference_id") === pageToken()) return;
    url.searchParams.set("client_reference_id", pageToken());
    a.href = url.toString();
  } catch {
    // Malformed href: leave the link alone.
  }
}

function decorateAll(root: ParentNode = document) {
  root.querySelectorAll<HTMLAnchorElement>(STRIPE_LINK).forEach(decorate);
}

function stored(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem("oscen_attribution") || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

let sent = false;
function sendAttribution(a: HTMLAnchorElement) {
  if (sent) return;
  sent = true;
  const s = stored();
  const tier = a.dataset.tier || a.closest<HTMLElement>("[data-tier]")?.dataset.tier || "";
  const body = JSON.stringify({
    token: pageToken(),
    tier: tier || undefined,
    utm_source: s.utm_source,
    utm_medium: s.utm_medium,
    utm_campaign: s.utm_campaign,
    utm_content: s.utm_content,
    utm_term: s.utm_term,
    landing_page: s.landing_page || location.pathname,
    referrer: s.referrer,
  });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // Attribution must never get in the way of checkout.
  }
}

function stripeLinkFrom(e: Event): HTMLAnchorElement | null {
  const el = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>(STRIPE_LINK) : null;
  return el;
}

// Decorate as early as possible, again once everything has rendered, and on any
// interaction (covers links added or re-rendered later, e.g. sold-out updates).
decorateAll();
document.addEventListener("DOMContentLoaded", () => decorateAll(), { once: true });
for (const type of ["pointerdown", "focusin", "touchstart"]) {
  document.addEventListener(type, (e) => {
    const a = stripeLinkFrom(e);
    if (a) decorate(a);
  }, { capture: true, passive: true });
}
// click = normal and modified clicks; auxclick = middle click; contextmenu = "open in new tab".
for (const type of ["click", "auxclick", "contextmenu"]) {
  document.addEventListener(type, (e) => {
    const a = stripeLinkFrom(e);
    if (!a) return;
    decorate(a);
    sendAttribution(a);
  }, { capture: true });
}

export {};
