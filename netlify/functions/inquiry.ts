/**
 * Same-origin inquiry relay.
 *
 * The public contact / invest / build forms POST here (no secret in the
 * browser). This function de-spams, then forwards server-side to the OSCEN CRM
 * inquiries endpoint with the shared INQUIRY_SECRET as a Bearer token. Cloned
 * from meta-capi.ts: CORS allowlist, per-IP sliding-window rate limiter,
 * OPTIONS preflight, 5s fetch timeout, method gating, server-only secret.
 *
 * Routes (relative to /.netlify/functions/inquiry). The {kind, source} pair is
 * AUTHORITATIVE and set here, never trusted from the client:
 *   POST /contact  -> { kind: "OTHER",    source: "Website - Contact" }
 *   POST /invest   -> { kind: "INVESTOR", source: "Website - Investor" }
 *   POST /build    -> { kind: "PARTNER",  source: "Website - Collaborator" }
 *
 * Env (server-only, never PUBLIC_ so it stays out of the client bundle):
 *   CRM_ENDPOINT     (required) e.g. https://crm.oscen.ai/api/inquiries
 *   INQUIRY_SECRET   (required, secret) must match the value on the CRM site
 */

type HandlerEvent = {
  path: string;
  httpMethod: string;
  body: string | null;
  isBase64Encoded?: boolean;
  headers: Record<string, string | undefined>;
};

type HandlerResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

/** Sub-path -> authoritative CRM classification. Client input is ignored. */
const ROUTE_TO_INQUIRY: Record<string, { kind: string; source: string }> = {
  contact: { kind: "OTHER", source: "Website - Contact" },
  invest: { kind: "INVESTOR", source: "Website - Investor" },
  build: { kind: "PARTNER", source: "Website - Collaborator" },
};

const ALLOWED_ORIGINS = [
  "https://oscen.ai",
  "https://www.oscen.ai",
];

// KILL SWITCH (2026-08-21): temporarily stop forwarding inquiries to the CRM
// while a spam flood is coming through the public forms. Disabled by DEFAULT so
// merging/deploying this change turns submissions off with no dashboard step.
// To re-enable WITHOUT a redeploy, set INQUIRY_ENABLED="true" in the Netlify env.
// The real fix is a CAPTCHA (Cloudflare Turnstile) on the forms; see
// oscen-website/PROGRESS.md "Spam / CAPTCHA plan". Remove this switch once that
// ships. While disabled the relay returns a normal 200 {ok:true} (matching the
// honeypot path) so bots see success and do not retry, and nothing reaches the
// CRM. NOTE: genuine inquiries are also dropped while off, so re-enable soon.
const INQUIRIES_ENABLED = process.env.INQUIRY_ENABLED === "true";

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

function clientIp(headers: Record<string, string | undefined>): string | undefined {
  // Prefer the Netlify-set client IP: it is the real TCP source and cannot be spoofed by the
  // caller. Fall back to X-Forwarded-For only if it is absent (client-controlled, so last resort).
  const nf = headers["x-nf-client-connection-ip"];
  if (nf) return nf;
  const xff = headers["x-forwarded-for"];
  const first = xff?.split(",")[0]?.trim();
  return first || undefined;
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
  // Path arrives as "/.netlify/functions/inquiry/contact" or just "/contact"
  // depending on Netlify config. Strip everything up to and including the
  // function name.
  const parts = path.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "inquiry");
  const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : parts[parts.length - 1] || "";
  return tail || null;
}

/** Minimal multipart/form-data parser for simple text fields (no file uploads). */
function parseMultipart(raw: string, contentType: string): Record<string, string> {
  const boundaryMatch = /boundary=("?)([^";,]+)\1/i.exec(contentType);
  if (!boundaryMatch) return {};
  const boundary = `--${boundaryMatch[2]}`;
  const out: Record<string, string> = {};
  for (const part of raw.split(boundary)) {
    if (!part || part === "--" || part.trim() === "--") continue;
    const split = part.indexOf("\r\n\r\n");
    if (split === -1) continue;
    const headerBlock = part.slice(0, split);
    const nameMatch = /name="([^"]*)"/i.exec(headerBlock);
    if (!nameMatch) continue;
    out[nameMatch[1]] = part.slice(split + 4).replace(/\r\n$/, "");
  }
  return out;
}

/** Parse JSON, urlencoded, or multipart bodies. Returns null on malformed input. */
function parseBody(event: HandlerEvent): Record<string, unknown> | null {
  const ctRaw = event.headers["content-type"] || event.headers["Content-Type"] || "";
  const ct = ctRaw.toLowerCase();
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  try {
    if (ct.includes("application/json")) {
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    }
    if (ct.includes("multipart/form-data")) {
      return parseMultipart(raw, ctRaw);
    }
    return Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return null;
  }
}

/**
 * Verify a Cloudflare Turnstile token server-side. Only enforced when
 * TURNSTILE_SECRET_KEY is set; if it is not configured we skip verification so
 * the relay keeps working without CAPTCHA (the honeypot + rate limiter + kill
 * switch still apply). Returns true = human/allowed, false = reject.
 */
async function verifyTurnstile(token: string, ip: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured -> do not block
  if (!token) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // fail closed on network/timeout when CAPTCHA is configured
  } finally {
    clearTimeout(timer);
  }
}

async function postToCrm(
  endpoint: string,
  secret: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status };
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

  // Kill switch: while inquiries are disabled, accept and silently drop every
  // submission (same 200 {ok:true} shape as the honeypot) instead of forwarding
  // to the CRM. Stops the spam flood at the relay with no bot-retry signal.
  if (!INQUIRIES_ENABLED) {
    console.warn("[inquiry] submissions disabled (INQUIRY_ENABLED != true); dropping request");
    return json(200, { ok: true }, origin);
  }

  const endpoint = process.env.CRM_ENDPOINT;
  const secret = process.env.INQUIRY_SECRET;
  if (!endpoint || !secret) {
    return json(500, { error: "inquiry_not_configured" }, origin);
  }

  const ip = clientIp(event.headers);
  if (!rateLimit(ip)) {
    return json(429, { error: "rate_limited" }, origin);
  }

  const route = routeOf(event.path || "");
  const mapping = route ? ROUTE_TO_INQUIRY[route] : undefined;
  if (!mapping) return json(404, { error: "not_found" }, origin);

  const fields = parseBody(event);
  if (fields === null) return json(400, { error: "invalid_body" }, origin);

  // Honeypot: bots fill a hidden field humans never see. Pretend success, drop.
  const gotcha = fields._gotcha;
  if (gotcha !== undefined && String(gotcha).trim() !== "") {
    return json(200, { ok: true }, origin);
  }

  // CAPTCHA: verify the Cloudflare Turnstile token. No-op unless
  // TURNSTILE_SECRET_KEY is configured (see verifyTurnstile).
  const tokenRaw = fields["cf-turnstile-response"];
  const token = typeof tokenRaw === "string" ? tokenRaw : "";
  if (!(await verifyTurnstile(token, ip))) {
    return json(400, { error: "captcha_failed" }, origin);
  }

  // Forward every submitted field EXCEPT the honeypot, the CAPTCHA token, and any
  // client-supplied kind/source/data/submission. Dropping data/submission is
  // critical: the CRM also reads fields nested under those keys, so leaving them
  // in would let a caller smuggle {data:{kind:"INVESTOR"}} past this
  // authoritative mapping.
  const {
    _gotcha,
    "cf-turnstile-response": _cf,
    kind: _k,
    source: _s,
    data: _d,
    submission: _sub,
    ...rest
  } = fields;
  const payload = { ...rest, kind: mapping.kind, source: mapping.source };

  try {
    const result = await postToCrm(endpoint, secret, payload);
    if (result.ok) return json(200, { ok: true }, origin);
    // Normalized error only. Never echo the secret or the raw CRM body.
    return json(result.status, { error: "inquiry_rejected" }, origin);
  } catch {
    return json(502, { error: "inquiry_unavailable" }, origin);
  }
};

export default handler;
