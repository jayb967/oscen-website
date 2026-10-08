/**
 * Calendly booking relay: POST /.netlify/functions/calendly-booked
 *
 * After an accredited investor submits /invest, the page shows the Calendly
 * inline widget. When they book, Calendly posts `calendly.event_scheduled`
 * to the page with the event + invitee URIs; the page sends them here and we
 * forward server-side to the CRM (POST <CRM_ENDPOINT>/booked, Bearer
 * INQUIRY_SECRET), which attaches the booking to the investor's record and,
 * when CALENDLY_TOKEN is set there, verifies it against Calendly's API.
 *
 * Same request hardening as the ad relays (origin allowlist, per-IP rate
 * limit, 4 KB cap); only validated fields are forwarded and upstream errors
 * are never echoed.
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

const EVENT_URI = /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+$/;
const INVITEE_URI = /^https:\/\/api\.calendly\.com\/scheduled_events\/([A-Za-z0-9-]+)\/invitees\/[A-Za-z0-9-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_page"] as const;

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

  const email = boundedStr(body.email, 254, EMAIL)?.toLowerCase();
  const eventUri = boundedStr(body.event_uri, 200, EVENT_URI);
  const inviteeUri = boundedStr(body.invitee_uri, 260, INVITEE_URI);
  // The invitee must belong to the same scheduled event.
  const sameEvent = !!eventUri && !!inviteeUri && inviteeUri.startsWith(`${eventUri}/invitees/`);
  if (!email || !eventUri || !inviteeUri || !sameEvent) return json(400, { ok: false }, origin);

  const payload: Record<string, string> = { email, event_uri: eventUri, invitee_uri: inviteeUri };
  const name = boundedStr(body.name, 120);
  if (name) payload.name = name;
  for (const k of UTM_KEYS) {
    const v = boundedStr(body[k], 512);
    if (v) payload[k] = v;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${endpoint.replace(/\/+$/, "")}/booked`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`calendly-booked crm ${res.status}`);
      return json(502, { ok: false }, origin);
    }
    return json(200, { ok: true }, origin);
  } catch (err) {
    console.error("calendly-booked network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  } finally {
    clearTimeout(timer);
  }
};

export default handler;
