/**
 * Reddit, TikTok and X legs of the conversion fan-out.
 *
 * forms.ts calls fanOutAdConversion() right next to window.metaTrack with the
 * SAME event_id, so one conversion reaches Meta, Reddit and TikTok in the
 * browser and each platform can dedupe its browser + server pair:
 *   Reddit: pixel conversionId  == CAPI event_metadata.conversion_id
 *   TikTok: pixel event_id      == Events API event_id
 *   X:      pixel conversion_id == Conversion API conversion_id
 *
 * Server legs POST to /.netlify/functions/reddit-capi/<kind> and
 * /.netlify/functions/tiktok-events/<kind>, consent-gated exactly like the
 * Meta CAPI mirror: no granted consent = no email leaves the page.
 */

import { REDDIT_EVENT, TIKTOK_EVENT, type ConversionKind, type XConversionEvent } from "./ad-events";

type FanOut = {
  kind: ConversionKind;
  /** X only: send this X event instead of `kind` (e.g. investor_signup). */
  xEvent?: XConversionEvent;
  eventId: string;
  email?: string;
  /** Pixel params; value + currency are the only ones forwarded server-side. */
  params: Record<string, unknown>;
};

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function post(path: string, body: Record<string, unknown>) {
  try {
    void fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best-effort. The browser pixel already fired.
  }
}

export function fanOutAdConversion({ kind, xEvent, eventId, email, params }: FanOut): void {
  if (typeof window === "undefined") return;
  const xRoute = xEvent ?? kind;

  if (typeof window.redditTrack === "function") {
    window.redditTrack(REDDIT_EVENT[kind], params, eventId);
  }
  if (typeof window.tiktokTrack === "function") {
    window.tiktokTrack(TIKTOK_EVENT[kind], params, eventId);
  }
  if (typeof window.xTrack === "function") {
    window.xTrack(xRoute, params, eventId);
  }

  if (window.oscenConsent?.state() !== "granted") return;

  const clickIds = window.oscenClickIds?.() ?? {};
  const shared = {
    event_id: eventId,
    event_source_url: window.location.href,
    referrer: document.referrer || undefined,
    email,
    value: numberOrUndefined(params.value),
    currency: typeof params.currency === "string" ? params.currency : undefined,
  };

  if (import.meta.env.PUBLIC_REDDIT_PIXEL_ENABLED === "true") {
    post(`/.netlify/functions/reddit-capi/${kind}`, {
      ...shared,
      click_id: clickIds.rdt_cid,
      browser_id: window.redditGetUuid?.(),
    });
  }
  if (import.meta.env.PUBLIC_TIKTOK_PIXEL_ENABLED === "true") {
    post(`/.netlify/functions/tiktok-events/${kind}`, {
      ...shared,
      click_id: clickIds.ttclid,
      browser_id: window.tiktokGetTtp?.(),
    });
  }
  if (import.meta.env.PUBLIC_X_PIXEL_ENABLED === "true") {
    post(`/.netlify/functions/x-conversions/${xRoute}`, { ...shared, click_id: clickIds.twclid });
  }
}
