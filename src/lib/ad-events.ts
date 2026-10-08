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

/** Click ids captured first-touch by attribution.ts and forwarded server-side. */
export const CLICK_ID_KEYS = ["rdt_cid", "ttclid", "fbclid", "gclid"] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

export function isConversionKind(v: unknown): v is ConversionKind {
  return typeof v === "string" && (CONVERSION_KINDS as readonly string[]).includes(v);
}
