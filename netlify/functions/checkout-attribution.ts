/**
 * Checkout attribution relay: POST /.netlify/functions/checkout-attribution
 *
 * When a visitor clicks a Stripe Payment Link, src/scripts/checkout-links.ts
 * puts a random token on the link as client_reference_id and beacons the
 * visitor's first-touch attribution here under that token. We forward it to
 * the CRM (`${origin of CRM_ENDPOINT}/api/support/checkout-attribution`,
 * Bearer INQUIRY_SECRET), which the Stripe webhook joins to the purchase so
 * revenue can be reported per campaign.
 *
 * Same hardening as the other relays: origin allowlist, per-IP rate limit,
 * 4 KB cap, field allowlist with bounded strings; upstream errors are never
 * echoed. The data is the same first-party attribution the First in Line and
 * inquiry forms already send (no ad click ids).
 */

import {
  MAX_BODY_BYTES,
  boundedStr,
  clientIp,
  isAllowedOrigin,
  json,
  rateLimited,
  type HandlerEvent,
  type HandlerResponse,
} from "../lib/ad-relay";

const TOKEN = /^oa_[A-Za-z0-9_-]{16,64}$/;
const TIER = /^[a-z]{3,20}$/;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Bounded, trimmed string; longer values are cut rather than dropped. */
function cut(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? boundedStr(v.trim().slice(0, max), max) : undefined;
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const origin = event.headers["origin"] || event.headers["Origin"];
  if (event.httpMethod === "OPTIONS") return json(204, "", origin);
  if (event.httpMethod !== "POST") return json(405, { ok: false }, origin);
  if (!isAllowedOrigin(origin)) return json(403, { ok: false }, origin);

  const endpoint = process.env.CRM_ENDPOINT;
  const secret = process.env.INQUIRY_SECRET;
  if (!endpoint || !secret) return json(200, { ok: false, reason: "not_configured" }, origin);
  if (rateLimited(clientIp(event.headers))) return json(429, { ok: false }, origin);

  const raw = event.body || "";
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json(413, { ok: false }, origin);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch {
    return json(400, { ok: false }, origin);
  }

  const token = boundedStr(body.token, 70, TOKEN);
  if (!token) return json(400, { ok: false }, origin);
  const payload: Record<string, string> = { token };
  const tier = boundedStr(body.tier, 20, TIER);
  if (tier) payload.tier = tier;
  for (const k of UTM_KEYS) {
    const v = cut(body[k], 200);
    if (v) payload[k] = v;
  }
  const landing = cut(body.landing_page, 500);
  if (landing?.startsWith("/")) payload.landing_page = landing;
  const referrer = cut(body.referrer, 500);
  if (referrer && /^https?:\/\//i.test(referrer)) payload.referrer = referrer;

  let url: string;
  try {
    url = `${new URL(endpoint).origin}/api/support/checkout-attribution`;
  } catch {
    return json(200, { ok: false, reason: "not_configured" }, origin);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`checkout-attribution crm ${res.status}`);
      return json(502, { ok: false }, origin);
    }
    return json(200, { ok: true }, origin);
  } catch (err) {
    console.error("checkout-attribution network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  } finally {
    clearTimeout(timer);
  }
};

export default handler;
