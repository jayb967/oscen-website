/**
 * TikTok Events API 2.0 server leg (hardened; see netlify/lib/ad-relay.ts).
 *
 * POST /.netlify/functions/tiktok-events/<lead|subscribe|registration|purchase>
 * from src/lib/ad-conversions.ts, with the SAME event_id the browser pixel
 * sent, so TikTok dedupes on pixel code + event + event_id.
 *
 * Upstream: POST https://business-api.tiktok.com/open_api/v1.3/event/track/
 * (https://business-api.tiktok.com/portal/docs/events-api-2.0/v1.3), header
 * Access-Token from TikTok Events Manager > pixel > Settings.
 *
 * Env (server-only except the pixel id, which is already public):
 *   TIKTOK_EVENTS_ACCESS_TOKEN  Events API access token (secret)
 *   PUBLIC_TIKTOK_PIXEL_ID      pixel code, sent as event_source_id
 *   TIKTOK_TEST_EVENT_CODE      optional; Events Manager > Test Events code
 */

import { TIKTOK_EVENT } from "../../src/lib/ad-events";
import { hashEmail, json, parseRequest, postUpstream, type HandlerEvent, type HandlerResponse } from "../lib/ad-relay";

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const token = process.env.TIKTOK_EVENTS_ACCESS_TOKEN;
  const pixelId = process.env.PUBLIC_TIKTOK_PIXEL_ID;
  const parsed = parseRequest(event, "tiktok-events", !!token && !!pixelId);
  if ("response" in parsed) return parsed.response;
  const { conversion: c, origin } = parsed;

  // TikTok requires email to be SHA-256 hashed; ip + user_agent go unhashed.
  const user: Record<string, unknown> = {};
  const email = hashEmail(c.email);
  if (email) user.email = email;
  if (c.clickId) user.ttclid = c.clickId;
  if (c.browserId) user.ttp = c.browserId;
  if (c.ip) user.ip = c.ip;
  if (c.userAgent) user.user_agent = c.userAgent;

  const properties: Record<string, unknown> = {};
  if (c.value !== undefined) {
    properties.value = c.value;
    properties.currency = c.currency;
  }

  const payload: Record<string, unknown> = {
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: TIKTOK_EVENT[c.kind],
        event_time: Math.floor(Date.now() / 1000),
        event_id: c.eventId,
        user,
        properties,
        page: { url: c.sourceUrl, referrer: c.referrer },
      },
    ],
  };
  const testCode = process.env.TIKTOK_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  try {
    const res = await postUpstream(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      { "Access-Token": token! },
      payload,
    );
    // TikTok answers HTTP 200 with a non-zero "code" on rejection.
    let code: unknown;
    try {
      code = JSON.parse(res.body)?.code;
    } catch {
      code = undefined;
    }
    if (!res.ok || code !== 0) {
      console.error(`tiktok-events upstream ${res.status}`, res.body);
      return json(502, { ok: false }, origin);
    }
    return json(200, { ok: true }, origin);
  } catch (err) {
    console.error("tiktok-events network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  }
};

export default handler;
