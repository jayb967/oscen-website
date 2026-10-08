/**
 * Checkout verification relay: POST /.netlify/functions/checkout-verify
 *
 * The Stripe Payment Links return buyers to /support?ok=1&tier=X&session_id=cs_...
 * Before the page reports a Purchase to the ad platforms it posts the session id
 * here; we ask the CRM (`${origin of CRM_ENDPOINT}/api/support/checkout-verify`,
 * Bearer INQUIRY_SECRET), which checks its own record or Stripe. The browser only
 * gets { ok, paid, tier, value, currency }, so a typed or shared ?ok=1 URL never
 * counts as a sale and the reported value is what was actually paid.
 *
 * Same request hardening as the other relays (origin allowlist, per-IP rate
 * limit, 4 KB cap); upstream errors are never echoed.
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

const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

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
  let sessionId: string | undefined;
  try {
    const parsed = JSON.parse(raw || "{}");
    sessionId = boundedStr(parsed?.session_id, 220, SESSION_ID);
  } catch {
    return json(400, { ok: false }, origin);
  }
  if (!sessionId) return json(400, { ok: false }, origin);

  let url: string;
  try {
    url = `${new URL(endpoint).origin}/api/support/checkout-verify`;
  } catch {
    return json(200, { ok: false, reason: "not_configured" }, origin);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ sessionId }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`checkout-verify crm ${res.status}`);
      return json(502, { ok: false }, origin);
    }
    const data = (await res.json()) as { paid?: unknown; tier?: unknown; value?: unknown; currency?: unknown };
    return json(200, {
      ok: true,
      paid: data.paid === true,
      tier: typeof data.tier === "string" ? data.tier : null,
      value: typeof data.value === "number" && Number.isFinite(data.value) ? data.value : 0,
      currency: typeof data.currency === "string" ? data.currency.slice(0, 3) : "USD",
    }, origin);
  } catch (err) {
    console.error("checkout-verify network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  } finally {
    clearTimeout(timer);
  }
};

export default handler;
