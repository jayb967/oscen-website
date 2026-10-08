/**
 * Reddit Conversions API v3 server leg (hardened; see netlify/lib/ad-relay.ts).
 *
 * POST /.netlify/functions/reddit-capi/<lead|subscribe|registration|purchase>
 * from src/lib/ad-conversions.ts, with the SAME event id the browser pixel sent
 * as conversionId, so Reddit dedupes the pair on metadata.conversion_id.
 *
 * Upstream: POST https://ads-api.reddit.com/api/v3/pixels/{pixel_id}/conversion_events
 * (https://ads-api.reddit.com/docs/v3/api/post-conversion-events), Bearer auth
 * with a conversion access token from Reddit Ads > Events Manager.
 *
 * Env (server-only except the pixel id, which is already public):
 *   REDDIT_CAPI_TOKEN        conversion access token (secret)
 *   PUBLIC_REDDIT_PIXEL_ID   pixel id, used in the path
 *   REDDIT_CAPI_TEST_ID      optional; Events Manager test id while verifying
 */

import { REDDIT_CAPI_TYPE } from "../../src/lib/ad-events";
import { hashEmail, json, parseRequest, postUpstream, type HandlerEvent, type HandlerResponse } from "../lib/ad-relay";

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const token = process.env.REDDIT_CAPI_TOKEN;
  const pixelId = process.env.PUBLIC_REDDIT_PIXEL_ID;
  const parsed = parseRequest(event, "reddit-capi", !!token && !!pixelId);
  if ("response" in parsed) return parsed.response;
  const { conversion: c, origin } = parsed;

  const user: Record<string, unknown> = {};
  const email = hashEmail(c.email);
  if (email) user.email = email;
  if (c.ip) user.ip_address = c.ip;
  if (c.userAgent) user.user_agent = c.userAgent;
  if (c.browserId) user.uuid = c.browserId;

  const metadata: Record<string, unknown> = { conversion_id: c.eventId };
  if (c.value !== undefined) {
    metadata.value = c.value;
    metadata.currency = c.currency;
  }

  const data: Record<string, unknown> = {
    events: [
      {
        event_at: Date.now(),
        action_source: "WEBSITE",
        type: { tracking_type: REDDIT_CAPI_TYPE[c.kind] },
        click_id: c.clickId,
        event_source_url: c.sourceUrl,
        referrer_url: c.referrer,
        metadata,
        user,
      },
    ],
  };
  const testId = process.env.REDDIT_CAPI_TEST_ID;
  if (testId) data.test_id = testId;

  try {
    const res = await postUpstream(
      `https://ads-api.reddit.com/api/v3/pixels/${encodeURIComponent(pixelId!)}/conversion_events`,
      { Authorization: `Bearer ${token}` },
      { data },
    );
    if (!res.ok) {
      console.error(`reddit-capi upstream ${res.status}`, res.body);
      return json(502, { ok: false }, origin);
    }
    return json(200, { ok: true }, origin);
  } catch (err) {
    console.error("reddit-capi network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  }
};

export default handler;
