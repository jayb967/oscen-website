/**
 * X (Twitter) pixel loader for oscen.ai.
 *
 * Consent-gated exactly like the other pixels (see pixel-gate.ts and the
 * region rules in consent.ts). Enabled by PUBLIC_X_PIXEL_ENABLED="true" +
 * PUBLIC_X_PIXEL_ID (e.g. "rgr3c"). Boot = X's base code verbatim in
 * behavior: load uwt.js and call twq('config', <pixel id>).
 *
 * window.xTrack(kind, params, eventId) fires twq('event', <tw-...-id>, ...)
 * with conversion_id = eventId, the same id the x-conversions server leg
 * sends, so X counts the pair once. Kinds without a PUBLIC_X_EVENT_* id are
 * skipped.
 */

import { X_PAGE_EVENT_FOR_PATH, xEventId, type ConversionKind, type XPageEvent } from "../lib/ad-events";
import { consentGatedTracker } from "./pixel-gate";

type Twq = ((...args: unknown[]) => void) & {
  exe?: (...args: unknown[]) => void;
  queue: unknown[];
  version: string;
};

type Call = { eventId: string; params: Record<string, unknown> };

const SDK_URL = "https://static.ads-twitter.com/uwt.js";

/** Build-time map kind -> X event id. Literal env reads so Vite inlines them;
 *  the names match X_EVENT_ENV in ad-events.ts (the server side reads those). */
const EVENT_IDS: Record<ConversionKind, string | undefined> = {
  lead: xEventId(import.meta.env.PUBLIC_X_EVENT_LEAD),
  subscribe: xEventId(import.meta.env.PUBLIC_X_EVENT_SUBSCRIBE),
  registration: xEventId(import.meta.env.PUBLIC_X_EVENT_REGISTRATION),
  purchase: xEventId(import.meta.env.PUBLIC_X_EVENT_PURCHASE),
};

/** Page-visit events for audiences (names match X_PAGE_EVENT_ENV). */
const PAGE_EVENT_IDS: Record<XPageEvent, string | undefined> = {
  invest_view: xEventId(import.meta.env.PUBLIC_X_EVENT_INVEST_VIEW),
};

function injectBase(pixelId: string) {
  // X conversion tracking base code, translated to TS without changing behavior.
  const w = window as unknown as { twq?: Twq };
  if (!w.twq) {
    const s = ((...args: unknown[]) => {
      if (s.exe) s.exe(...args);
      else s.queue.push(args);
    }) as Twq;
    s.version = "1.1";
    s.queue = [];
    w.twq = s;
    const u = document.createElement("script");
    u.async = true;
    u.src = SDK_URL;
    const a = document.getElementsByTagName("script")[0];
    a.parentNode?.insertBefore(u, a);
  }
  w.twq("config", pixelId);
}

function fire(call: Call) {
  const twq = (window as unknown as { twq?: Twq }).twq;
  if (!twq) return;
  const props: Record<string, unknown> = { conversion_id: call.params.conversion_id };
  if (typeof call.params.value === "number") props.value = call.params.value;
  if (typeof call.params.currency === "string") props.currency = call.params.currency;
  twq("event", call.eventId, props);
}

function newConversionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `x_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Page-visit event for this path (e.g. /invest -> audience event), fired once
 * per page load from the pixel and mirrored server-side with the same
 * conversion_id. Runs inside boot, so consent is already granted.
 */
function firePageEvent() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const route = X_PAGE_EVENT_FOR_PATH[path];
  const eventId = route ? PAGE_EVENT_IDS[route] : undefined;
  if (!route || !eventId) return;
  const conversionId = newConversionId();
  fire({ eventId, params: { conversion_id: conversionId } });
  try {
    void fetch(`/.netlify/functions/x-conversions/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event_id: conversionId,
        event_source_url: window.location.href,
        click_id: window.oscenClickIds?.().twclid,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best-effort; the pixel already fired.
  }
}

const track = consentGatedTracker<Call>({
  enabled: import.meta.env.PUBLIC_X_PIXEL_ENABLED === "true",
  pixelId: import.meta.env.PUBLIC_X_PIXEL_ID as string | undefined,
  boot: (pixelId) => {
    injectBase(pixelId);
    firePageEvent();
  },
  fire,
});

function xTrack(kind: ConversionKind, params: Record<string, unknown>, conversionId: string) {
  const eventId = EVENT_IDS[kind];
  if (!eventId) return;
  track({ eventId, params: { ...params, conversion_id: conversionId } });
}

declare global {
  interface Window {
    xTrack: typeof xTrack;
  }
}

if (typeof window !== "undefined") window.xTrack = xTrack;

export {};
