/**
 * Shared core for oscen.ai first-party analytics (Cloudflare Worker at /e,
 * Analytics Engine dataset oscen_clicks). Used by click-tracking.ts and
 * engagement.ts.
 *
 * - One random page-view id per page load, kept in memory only (no cookie,
 *   no storage), so events from the same view can be grouped.
 * - A client-side bot signal (automation flag, bot user agent, no languages).
 *   The Worker adds its own server-side user-agent check; events are labelled
 *   human or bot, never dropped, so reports can count humans only.
 * - Events are sent in batches with sendBeacon (fetch keepalive fallback).
 */

const ENDPOINT = "/e";

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|python|curl|wget|httpclient|axios|node-fetch|go-http|java\/|phantom|puppeteer|playwright|selenium|gptbot|chatgpt|oai-search|claude|anthropic|perplexity|bytespider|ccbot|amazonbot|applebot|facebookexternalhit|bingpreview|yandex|baidu|semrush|ahrefs|mj12/i;

export const pageViewId: string =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 18)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** 1 when the browser looks automated. Only a signal; the Worker double-checks. */
export const botSignal: 0 | 1 = (() => {
  try {
    const n = navigator as Navigator & { webdriver?: boolean };
    if (n.webdriver) return 1;
    if (BOT_UA.test(n.userAgent || "")) return 1;
    if (!n.languages || n.languages.length === 0) return 1;
    return 0;
  } catch {
    return 0;
  }
})();

type Attribution = { utm_source?: string; utm_campaign?: string; referrer?: string };

function attribution(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem("oscen_attribution") || "{}") as Attribution;
  } catch {
    return {};
  }
}

function safeHost(u: string): string | undefined {
  try {
    return new URL(u).host;
  } catch {
    return undefined;
  }
}

export function device(): string {
  const w = window.innerWidth;
  return w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop";
}

/** Analytics never runs on the private investor-pitch pages. */
export const analyticsEnabled =
  typeof window !== "undefined" && !location.pathname.startsWith("/investor-pitch");

/** Send one or more events (max 25 per request; the Worker enforces it too). */
export function send(events: Record<string, unknown> | Record<string, unknown>[]) {
  if (!analyticsEnabled) return;
  const list = (Array.isArray(events) ? events : [events]).slice(0, 25);
  if (list.length === 0) return;
  const a = attribution();
  const shared = {
    path: location.pathname,
    utm_source: a.utm_source,
    utm_campaign: a.utm_campaign,
    ref: a.referrer ? safeHost(a.referrer) : undefined,
    device: device(),
    vw: window.innerWidth,
    pv: pageViewId,
    bot: botSignal,
  };
  const body = JSON.stringify({ events: list.map((e) => ({ ...shared, ...e })) });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // Analytics must never break the page.
  }
}
