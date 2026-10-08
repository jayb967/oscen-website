/**
 * Single source of truth for how one site conversion maps onto each ad
 * platform's standard event name. forms.ts, the pixel loaders and the
 * reddit-capi / tiktok-events Netlify functions all import from here, so a
 * conversion is named once and fanned out everywhere with ONE event_id.
 *
 * Meta names live in meta-events.ts (older, kept as is).
 */

/** Site-level conversion kinds. These are also the server route segments. */
export type ConversionKind = "lead" | "subscribe" | "registration" | "purchase";

export const CONVERSION_KINDS: readonly ConversionKind[] = [
  "lead",
  "subscribe",
  "registration",
  "purchase",
] as const;

/** Reddit Pixel / Conversions API tracking_type per conversion. */
export const REDDIT_EVENT: Record<ConversionKind, RedditEventName> = {
  lead: "Lead",
  subscribe: "SignUp",
  registration: "SignUp",
  purchase: "Purchase",
};

export type RedditEventName = "PageVisit" | "ViewContent" | "Lead" | "SignUp" | "Purchase";

/** Conversions API v3 spells the same events UPPER_SNAKE (migration guide). */
export const REDDIT_CAPI_TYPE: Record<ConversionKind, string> = {
  lead: "LEAD",
  subscribe: "SIGN_UP",
  registration: "SIGN_UP",
  purchase: "PURCHASE",
};

/** TikTok Pixel / Events API event name per conversion. Uses the 2025-05-01
 *  names (SubmitForm -> Lead, CompletePayment -> Purchase); old names still work. */
export const TIKTOK_EVENT: Record<ConversionKind, TikTokEventName> = {
  lead: "Lead",
  subscribe: "Subscribe",
  registration: "CompleteRegistration",
  purchase: "Purchase",
};

export type TikTokEventName =
  | "ViewContent"
  | "Lead"
  | "Subscribe"
  | "CompleteRegistration"
  | "Purchase";

/**
 * X (Twitter) uses per-pixel event ids ("tw-<pixel>-<code>") created in X
 * Events Manager, not fixed names. One public env var per conversion kind;
 * a kind with no id is simply not sent to X. Read on both sides: the pixel
 * (import.meta.env) and the x-conversions function (process.env).
 */
export const X_EVENT_ENV: Record<ConversionKind, string> = {
  lead: "PUBLIC_X_EVENT_LEAD",
  subscribe: "PUBLIC_X_EVENT_SUBSCRIBE",
  registration: "PUBLIC_X_EVENT_REGISTRATION",
  purchase: "PUBLIC_X_EVENT_PURCHASE",
};

/**
 * X page-visit events (audience building), fired once per visit to a page by
 * the X pixel and mirrored to the Conversion API with the same conversion_id.
 * Route segment on x-conversions -> env var holding the "tw-..." event id.
 */
export type XPageEvent = "invest_view";
export const X_PAGE_EVENT_ENV: Record<XPageEvent, string> = {
  invest_view: "PUBLIC_X_EVENT_INVEST_VIEW",
};
/** Which page fires which X page event (pathname without trailing slash). */
export const X_PAGE_EVENT_FOR_PATH: Record<string, XPageEvent | undefined> = {
  "/invest": "invest_view",
};
/**
 * X-only conversion events: an X conversion that must NOT ride a shared kind.
 * investor_signup fires only from the investor form (forms.ts
 * trackingForInvestor), so the X "sign up" conversion counts investors and
 * nothing else (founder 2026-10-08). Same relay and dedupe as the shared kinds.
 */
export type XConversionEvent = "investor_signup";
export const X_CONVERSION_EVENT_ENV: Record<XConversionEvent, string> = {
  investor_signup: "PUBLIC_X_EVENT_INVESTOR_SIGNUP",
};
export function isXConversionEvent(v: unknown): v is XConversionEvent {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(X_CONVERSION_EVENT_ENV, v);
}

export function isXPageEvent(v: unknown): v is XPageEvent {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(X_PAGE_EVENT_ENV, v);
}

/** "tw-rgr3c-abc12" style id, or undefined if unset/malformed. */
export function xEventId(raw: unknown): string | undefined {
  return typeof raw === "string" && /^tw-[a-z0-9]+-[a-z0-9]+$/i.test(raw.trim()) ? raw.trim() : undefined;
}

/** Click ids captured first-touch by attribution.ts and forwarded server-side. */
export const CLICK_ID_KEYS = ["rdt_cid", "ttclid", "twclid", "fbclid", "gclid"] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

export function isConversionKind(v: unknown): v is ConversionKind {
  return typeof v === "string" && (CONVERSION_KINDS as readonly string[]).includes(v);
}
