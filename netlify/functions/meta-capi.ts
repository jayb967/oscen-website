/**
 * Server-side Meta Conversions API forwarder.
 *
 * Browser pixel fires Lead / Subscribe / CompleteRegistration; src/lib/forms.ts
 * POSTs a parallel payload here with the SAME event_id, so Meta dedupes the
 * browser + server pair. Server-side recovers iOS / ad-blocker / ITP losses
 * and boosts Event Match Quality (we forward IP, UA, fbp, fbc).
 *
 * Routes (relative to /.netlify/functions/meta-capi):
 *   POST /lead          -> Lead
 *   POST /subscribe     -> Subscribe
 *   POST /registration  -> CompleteRegistration
 *   POST /custom        -> custom event (name from body.event_name)
 *
 * Env:
 *   META_CAPI_ACCESS_TOKEN   (required, secret)
 *   PUBLIC_META_PIXEL_ID     (required)
 *   META_CAPI_TEST_EVENT_CODE (optional, while verifying)
 */

import { createHash } from "node:crypto";

type HandlerEvent = {
  path: string;
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | undefined>;
};

type HandlerResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

const ROUTE_TO_EVENT: Record<string, string> = {
  lead: "Lead",
  subscribe: "Subscribe",
  registration: "CompleteRegistration",
};

const ALLOWED_ORIGINS = [
  "https://oscen.ai",
  "https://www.oscen.ai",
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;
const ipHits = new Map<string, number[]>();

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin)) return true;
  return false;
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allow = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, origin: string | undefined): HandlerResponse {
  return {
    statusCode: status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeAndHash(field: "em" | "ph" | "fn" | "ln" | "external_id", raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (field === "ph") {
    const digits = trimmed.replace(/\D/g, "");
    return digits ? sha256(digits) : null;
  }
  if (field === "external_id") return sha256(trimmed);
  return sha256(trimmed.toLowerCase());
}

function clientIp(headers: Record<string, string | undefined>): string | undefined {
  const xff = headers["x-forwarded-for"];
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers["x-nf-client-connection-ip"] || undefined;
}

function rateLimit(ip: string | undefined): boolean {
  if (!ip) return true;
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (ipHits.get(ip) || []).filter((t) => t > cutoff);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length <= RATE_LIMIT_MAX;
}

function routeOf(path: string): string | null {
  // Path arrives as "/.netlify/functions/meta-capi/lead" or just "/lead"
  // depending on Netlify config. Strip everything up to and including the
  // function name.
  const parts = path.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "meta-capi");
  const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : parts[parts.length - 1] || "";
  return tail || null;
}

async function postToMeta(payload: unknown, pixelId: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://graph.facebook.com/v21.0/${pixelId}/events`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const origin = event.headers["origin"] || event.headers["Origin"];

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" }, origin);
  }

  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.PUBLIC_META_PIXEL_ID;
  if (!token || !pixelId) {
    return json(500, { error: "capi_not_configured" }, origin);
  }

  const ip = clientIp(event.headers);
  if (!rateLimit(ip)) {
    return json(429, { error: "rate_limited" }, origin);
  }

  const route = routeOf(event.path || "");
  if (!route) return json(404, { error: "not_found" }, origin);

  let payload: any;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" }, origin);
  }

  let eventName: string | undefined;
  if (route === "custom") {
    eventName = typeof payload.event_name === "string" ? payload.event_name : undefined;
    if (!eventName) return json(400, { error: "missing_event_name" }, origin);
  } else {
    eventName = ROUTE_TO_EVENT[route];
    if (!eventName) return json(404, { error: "unknown_route" }, origin);
  }

  if (typeof payload.event_id !== "string" || !payload.event_id) {
    return json(400, { error: "missing_event_id" }, origin);
  }

  const ud = payload.user_data || {};
  const userData: Record<string, unknown> = {};
  for (const f of ["em", "ph", "fn", "ln", "external_id"] as const) {
    const hashed = normalizeAndHash(f, ud[f]);
    if (hashed) userData[f] = [hashed];
  }
  if (ip) userData.client_ip_address = ip;
  const ua = event.headers["user-agent"] || event.headers["User-Agent"];
  if (ua) userData.client_user_agent = ua;
  if (typeof payload.fbp === "string" && payload.fbp) userData.fbp = payload.fbp;
  if (typeof payload.fbc === "string" && payload.fbc) userData.fbc = payload.fbc;

  const metaPayload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: payload.event_id,
        event_source_url: payload.event_source_url || undefined,
        action_source: "website",
        user_data: userData,
        custom_data: payload.custom_data || undefined,
      },
    ],
    access_token: token,
  };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testCode) metaPayload.test_event_code = testCode;

  try {
    const result = await postToMeta(metaPayload, pixelId);
    if (!result.ok) {
      console.error("meta-capi rejected", JSON.stringify(result.body));
      return json(502, { error: "meta_rejected", details: result.body }, origin);
    }
    return json(200, { ok: true, meta: result.body }, origin);
  } catch (err: any) {
    console.error("meta-capi network error", err?.message || err);
    return json(503, { error: "network_error" }, origin);
  }
};

export default handler;
