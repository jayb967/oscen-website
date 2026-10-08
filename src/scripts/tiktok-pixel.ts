/**
 * TikTok Pixel loader for oscen.ai.
 *
 * Consent-gated exactly like meta-pixel.ts (see pixel-gate.ts). Enabled by
 * PUBLIC_TIKTOK_PIXEL_ENABLED="true" + PUBLIC_TIKTOK_PIXEL_ID (the pixel code
 * from TikTok Ads Manager > Tools > Events). Fires page() + ViewContent.
 *
 * window.tiktokTrack(eventName, params, eventId) passes event_id, which
 * dedupes against the tiktok-events server leg.
 */

import { pathToContent } from "../lib/meta-events";
import type { TikTokEventName } from "../lib/ad-events";
import { consentGatedTracker, injectScript, readCookie } from "./pixel-gate";

type Ttq = unknown[] & {
  methods: string[];
  setAndDefer: (t: Record<string, unknown>, e: string) => void;
  instance: (id: string) => unknown;
  load: (id: string, opts?: Record<string, unknown>) => void;
  page: () => void;
  track: (event: string, props?: Record<string, unknown>, opts?: Record<string, unknown>) => void;
  _i?: Record<string, unknown>;
  _t?: Record<string, number>;
  _o?: Record<string, unknown>;
};

type Call = { eventName: TikTokEventName; params?: Record<string, unknown>; eventId?: string };

/** TikTok properties we forward; free-form custom keys are dropped. */
const PROPERTY_KEYS = ["value", "currency", "content_id", "content_type", "content_name"] as const;

const SDK_URL = "https://analytics.tiktok.com/i18n/pixel/events.js";

function ttq(): Ttq | undefined {
  return (window as unknown as { ttq?: Ttq }).ttq;
}

function injectBase(pixelId: string) {
  // Official TikTok Pixel base snippet, hand-translated to TS.
  const w = window as unknown as { ttq?: Ttq; TiktokAnalyticsObject?: string };
  w.TiktokAnalyticsObject = "ttq";
  const q = (w.ttq = w.ttq || ([] as unknown as Ttq));
  q.methods = [
    "page", "track", "identify", "instances", "debug", "on", "off", "once", "ready",
    "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent",
    "grantConsent",
  ];
  q.setAndDefer = (t, e) => {
    t[e] = (...args: unknown[]) => {
      (t as unknown as unknown[]).push([e, ...args]);
    };
  };
  for (const m of q.methods) q.setAndDefer(q as unknown as Record<string, unknown>, m);
  q.instance = (id: string) => {
    const inst = (q._i?.[id] || []) as unknown as Record<string, unknown>;
    for (const m of q.methods) q.setAndDefer(inst, m);
    return inst;
  };
  q._i = q._i || {};
  q._i[pixelId] = [];
  (q._i[pixelId] as Record<string, unknown>)._u = SDK_URL;
  q._t = q._t || {};
  q._t[pixelId] = +new Date();
  q._o = q._o || {};
  q._o[pixelId] = {};
  injectScript(`${SDK_URL}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`);
}

function fire(call: Call) {
  const q = ttq();
  if (!q) return;
  const props: Record<string, unknown> = {};
  for (const k of PROPERTY_KEYS) {
    if (call.params?.[k] !== undefined) props[k] = call.params[k];
  }
  q.track(call.eventName, props, call.eventId ? { event_id: call.eventId } : undefined);
}

function boot(pixelId: string) {
  injectBase(pixelId);
  const q = ttq()!;
  q.page();
  const content = pathToContent(window.location.pathname);
  if (content) {
    q.track("ViewContent", {
      content_id: content.name,
      content_name: content.name,
      content_type: "product",
    });
  }
}

const track = consentGatedTracker<Call>({
  enabled: import.meta.env.PUBLIC_TIKTOK_PIXEL_ENABLED === "true",
  pixelId: import.meta.env.PUBLIC_TIKTOK_PIXEL_ID as string | undefined,
  boot,
  fire,
});

function tiktokTrack(
  eventName: TikTokEventName,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  track({ eventName, params, eventId });
}

/** TikTok's first-party pixel cookie, forwarded as user.ttp server-side. */
function tiktokGetTtp(): string | undefined {
  return readCookie("_ttp");
}

declare global {
  interface Window {
    tiktokTrack: typeof tiktokTrack;
    tiktokGetTtp: typeof tiktokGetTtp;
  }
}

if (typeof window !== "undefined") {
  window.tiktokTrack = tiktokTrack;
  window.tiktokGetTtp = tiktokGetTtp;
}

export {};
