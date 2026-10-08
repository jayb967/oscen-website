/**
 * X (Twitter) Conversion API relay: POST /.netlify/functions/x-conversions/<kind>
 *
 * Server leg of the conversion fan-out (src/lib/ad-conversions.ts). Shares the
 * hardened request handling in netlify/lib/ad-relay.ts (origin allowlist,
 * event allowlist, 4 KB cap, per-IP rate limit, upstream errors never echoed).
 *
 * Env:
 *   X_PIXEL_TOKEN          X Ads Manager > Events Manager > pixel > Manual
 *                          setup > Generate access token (secret)
 *   PUBLIC_X_PIXEL_ID      pixel id, e.g. "rgr3c"
 *   PUBLIC_X_EVENT_*       per-kind event ids "tw-<pixel>-<code>" (see
 *                          X_EVENT_ENV in src/lib/ad-events.ts); a kind with
 *                          no id answers not_configured
 *
 * conversion_id = the shared event_id, so X dedupes this against the pixel's
 * twq('event', ..., { conversion_id }) call.
 */

import { X_EVENT_ENV, isConversionKind, xEventId } from "../../src/lib/ad-events";
import { hashEmail, json, parseRequest, postUpstream, type HandlerEvent, type HandlerResponse } from "../lib/ad-relay";

const API = "https://ads-api.x.com/12/measurement/conversions";

/** The kind is only known after parsing, so read its event id up front from the path. */
function eventIdForPath(path: string): string | undefined {
  const kind = path.split("/").filter(Boolean).pop();
  return isConversionKind(kind) ? xEventId(process.env[X_EVENT_ENV[kind]]) : undefined;
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const token = process.env.X_PIXEL_TOKEN;
  const pixelId = process.env.PUBLIC_X_PIXEL_ID;
  const eventId = eventIdForPath(event.path || "");
  const parsed = parseRequest(event, "x-conversions", !!token && !!pixelId && !!eventId);
  if ("response" in parsed) return parsed.response;
  const { conversion: c, origin } = parsed;

  // X wants at least one of: twclid, hashed_email, or ip_address + user_agent.
  const identifier: Record<string, string> = {};
  if (c.clickId) identifier.twclid = c.clickId;
  const email = hashEmail(c.email);
  if (email) identifier.hashed_email = email;
  if (c.ip && c.userAgent) {
    identifier.ip_address = c.ip;
    identifier.user_agent = c.userAgent;
  }
  if (Object.keys(identifier).length === 0) return json(200, { ok: false, reason: "no_identifier" }, origin);

  const conversion: Record<string, unknown> = {
    conversion_time: new Date().toISOString(),
    event_id: eventId,
    conversion_id: c.eventId,
    identifiers: [identifier],
  };
  if (c.sourceUrl) conversion.event_source_url = c.sourceUrl;
  if (c.value !== undefined) {
    conversion.value = String(c.value);
    if (c.currency) conversion.price_currency = c.currency;
  }

  try {
    const res = await postUpstream(
      `${API}/${encodeURIComponent(pixelId!)}`,
      { "X-Pixel-Token": token! },
      { conversions: [conversion] },
    );
    if (!res.ok) {
      console.error(`x-conversions upstream ${res.status}`, res.body);
      return json(502, { ok: false }, origin);
    }
    return json(200, { ok: true }, origin);
  } catch (err) {
    console.error("x-conversions network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  }
};

export default handler;
