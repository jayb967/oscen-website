/**
 * Reddit Pixel loader for oscen.ai.
 *
 * Consent-gated exactly like meta-pixel.ts (see pixel-gate.ts). Enabled by
 * PUBLIC_REDDIT_PIXEL_ENABLED="true" + PUBLIC_REDDIT_PIXEL_ID (the a2_... id
 * from Reddit Ads > Events Manager). Fires PageVisit + ViewContent per page.
 *
 * window.redditTrack(eventName, params, eventId) passes eventId as Reddit's
 * conversionId, which dedupes against the reddit-capi server leg.
 */

import { pathToContent } from "../lib/meta-events";
import type { RedditEventName } from "../lib/ad-events";
import { consentGatedTracker, injectScript, readCookie } from "./pixel-gate";

type RdtFn = ((...args: unknown[]) => void) & {
  sendEvent?: (...args: unknown[]) => void;
  callQueue?: unknown[];
};

type Call = { eventName: RedditEventName; params?: Record<string, unknown>; eventId?: string };

/** Reddit only reads these metadata keys; everything else is dropped. */
const METADATA_KEYS = ["value", "currency", "itemCount", "products"] as const;

function rdt(): RdtFn | undefined {
  return (window as unknown as { rdt?: RdtFn }).rdt;
}

function injectBase(pixelId: string) {
  // Official Reddit Pixel base snippet, hand-translated to TS.
  const w = window as unknown as { rdt?: RdtFn };
  if (w.rdt) return;
  const p: RdtFn = function (...args: unknown[]) {
    if (p.sendEvent) p.sendEvent(...args);
    else p.callQueue!.push(args);
  } as RdtFn;
  p.callQueue = [];
  w.rdt = p;
  injectScript(`https://www.redditstatic.com/ads/pixel.js?pixel_id=${encodeURIComponent(pixelId)}`);
}

function fire(call: Call) {
  const fn = rdt();
  if (!fn) return;
  const meta: Record<string, unknown> = {};
  for (const k of METADATA_KEYS) {
    if (call.params?.[k] !== undefined) meta[k] = call.params[k];
  }
  if (call.eventId) meta.conversionId = call.eventId;
  fn("track", call.eventName, meta);
}

function boot(pixelId: string) {
  injectBase(pixelId);
  const fn = rdt()!;
  fn("init", pixelId);
  fn("track", "PageVisit");
  if (pathToContent(window.location.pathname)) fn("track", "ViewContent");
}

const track = consentGatedTracker<Call>({
  enabled: import.meta.env.PUBLIC_REDDIT_PIXEL_ENABLED === "true",
  pixelId: import.meta.env.PUBLIC_REDDIT_PIXEL_ID as string | undefined,
  boot,
  fire,
});

function redditTrack(
  eventName: RedditEventName,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  track({ eventName, params, eventId });
}

/** Reddit's first-party pixel cookie, forwarded as user.uuid server-side. */
function redditGetUuid(): string | undefined {
  return readCookie("_rdt_uuid");
}

declare global {
  interface Window {
    redditTrack: typeof redditTrack;
    redditGetUuid: typeof redditGetUuid;
  }
}

if (typeof window !== "undefined") {
  window.redditTrack = redditTrack;
  window.redditGetUuid = redditGetUuid;
}

export {};
