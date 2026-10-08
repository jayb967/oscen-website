/**
 * Meta Conversions API server leg (hardened; see netlify/lib/ad-relay.ts).
 * Closes PROGRESS M3 (2026-10-08): this used to forward any event name and
 * echo Meta's raw response body to the caller.
 *
 * Browser pixel fires Lead / Subscribe / CompleteRegistration / Purchase;
 * src/lib/forms.ts POSTs a parallel payload here with the SAME event_id, so
 * Meta dedupes the browser + server pair.
 *
 * Routes (relative to /.netlify/functions/meta-capi), fixed allowlist:
 *   POST /lead          -> Lead
 *   POST /subscribe     -> Subscribe
 *   POST /registration  -> CompleteRegistration
 *   POST /purchase      -> Purchase (supporter checkout return, /support?ok=1)
 *
 * Client contract (unchanged): { event_id, event_source_url,
 *   user_data: { em }, custom_data: {...}, fbp, fbc }.
 *
 * Env:
 *   META_CAPI_ACCESS_TOKEN    (required, secret)
 *   PUBLIC_META_PIXEL_ID      (required)
 *   META_CAPI_TEST_EVENT_CODE (optional, while verifying)
 */

import type { ConversionKind } from "../../src/lib/ad-events";
import {
  boundedStr,
  hashEmail,
  json,
  parseRequest,
  postUpstream,
  type HandlerEvent,
  type HandlerResponse,
} from "../lib/ad-relay";

const META_EVENT: Record<ConversionKind, string> = {
  lead: "Lead",
  subscribe: "Subscribe",
  registration: "CompleteRegistration",
  purchase: "Purchase",
};

/** custom_data: flat string/number/boolean values only, bounded keys and count. */
function cleanCustomData(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-z_]{1,40}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= 200) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const FB_COOKIE = /^fb\.\d+\.\d+\.[A-Za-z0-9._-]+$/;

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.PUBLIC_META_PIXEL_ID;
  const parsed = parseRequest(event, "meta-capi", !!token && !!pixelId);
  if ("response" in parsed) return parsed.response;
  const { conversion: c, origin, body } = parsed;

  const userData: Record<string, unknown> = {};
  const em = hashEmail(c.email);
  if (em) userData.em = [em];
  if (c.ip) userData.client_ip_address = c.ip;
  if (c.userAgent) userData.client_user_agent = c.userAgent;
  const fbp = boundedStr(body.fbp, 256, FB_COOKIE);
  const fbc = boundedStr(body.fbc, 512, FB_COOKIE);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: META_EVENT[c.kind],
        event_time: Math.floor(Date.now() / 1000),
        event_id: c.eventId,
        event_source_url: c.sourceUrl,
        action_source: "website",
        user_data: userData,
        custom_data: cleanCustomData(body.custom_data),
      },
    ],
    access_token: token,
  };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  try {
    const res = await postUpstream(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId!)}/events`,
      {},
      payload,
    );
    if (!res.ok) {
      console.error(`meta-capi upstream ${res.status}`, res.body);
      return json(502, { ok: false }, origin);
    }
    return json(200, { ok: true }, origin);
  } catch (err) {
    console.error("meta-capi network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  }
};

export default handler;
